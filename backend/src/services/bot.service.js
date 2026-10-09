const puppeteer = require('puppeteer');
const { supabase } = require('./supabase.service');
const { processMeetingAudio } = require('./pipeline.service');

const activeBots = new Map();

function formatZoomWebUrl(meetingUrl) {
  try {
    const urlObj = new URL(meetingUrl);
    if (urlObj.hostname.includes('zoom.us')) {
      const match = urlObj.pathname.match(/\/j\/(\d+)/);
      if (match && match[1]) {
        const meetingId = match[1];
        const pwd = urlObj.searchParams.get('pwd') || '';
        const pwdParam = pwd ? `?pwd=${encodeURIComponent(pwd)}` : '';
        return `https://app.zoom.us/wc/${meetingId}/join${pwdParam}`;
      }
    }
  } catch (e) {}
  return meetingUrl;
}

async function joinMeeting({ meetingUrl, teamId, title, botName = 'NudgeIQ Note Taker' }) {
  console.log(`[bot.service] Dispatching bot to ${meetingUrl} for team ${teamId}`);

  let meetingId = null;
  if (supabase) {
    const { data: newMeeting } = await supabase
      .from('meetings')
      .insert({
        team_id: teamId,
        title: title || `Recorded Meeting (${new URL(meetingUrl).hostname})`,
        meeting_date: new Date().toISOString(),
        status: 'pending',
      })
      .select()
      .single();
    if (newMeeting) meetingId = newMeeting.id;
  }
  if (!meetingId) meetingId = `meeting-${Date.now()}`;

  const targetUrl = formatZoomWebUrl(meetingUrl);

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--disable-blink-features=AutomationControlled',
        '--autoplay-policy=no-user-gesture-required',
        '--window-size=1280,720',
      ],
    });

    const context = browser.defaultBrowserContext();
    try {
      await context.overridePermissions(new URL(targetUrl).origin, ['microphone', 'camera']);
    } catch (e) {}

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    activeBots.set(meetingId, { browser, page, teamId, meetingId, status: 'joining', startedAt: Date.now() });

    runBotLifecycle(meetingId, page, browser, targetUrl, botName, teamId).catch((err) => {
      console.error(`[bot.service] Lifecycle error for ${meetingId}:`, err);
    });

    return { success: true, meetingId, status: 'joining', message: `Bot dispatched to ${meetingUrl}` };
  } catch (err) {
    console.error('[bot.service] Failed to launch bot:', err);
    throw err;
  }
}

async function runBotLifecycle(meetingId, page, browser, meetingUrl, botName, teamId) {
  try {
    const bot = activeBots.get(meetingId);
    if (!bot) return;

    // Inject caption scraper + audio tap before page loads
    await page.evaluateOnNewDocument(() => {
      window.__audioChunks = [];
      window.__liveTranscript = [];
      const seenCaptions = new Set();

      // Caption scraper — runs every 1.5s
      setInterval(() => {
        try {
          const selectors = [
            'div[jscontroller="D1tHje"]', 'div.a4bNc', 'div.iTTPOb',
            'div.nMkdId', 'div.T4LgNb', '.stream-caption', '.caption-text',
          ];
          document.querySelectorAll(selectors.join(',')).forEach((container) => {
            const speakerEl = container.querySelector('.bh44bd, .zs75Ib, .speaker-name, strong, b');
            let speaker = (speakerEl && speakerEl.innerText ? speakerEl.innerText : 'Participant').trim();
            let text = (container.innerText || '').replace(speaker, '').replace(/^[:\s]+/, '').trim();
            if (text && text.length > 3) {
              const key = speaker + ':' + text.slice(0, 50);
              if (!seenCaptions.has(key)) {
                seenCaptions.add(key);
                window.__liveTranscript.push({ speaker, time: new Date().toLocaleTimeString(), text });
              }
            }
          });
        } catch (e) {}
      }, 1500);

      // Audio tap via WebAudio
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        let masterDest = null;
        let masterRecorder = null;
        const initRecorder = (ctx) => {
          if (masterDest) return masterDest;
          try {
            masterDest = ctx.createMediaStreamDestination();
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
              : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
            masterRecorder = new MediaRecorder(masterDest.stream, { mimeType });
            masterRecorder.ondataavailable = (evt) => {
              if (evt.data && evt.data.size > 0) {
                const r = new FileReader();
                r.onloadend = () => { const b64 = (r.result || '').split(',')[1]; if (b64) window.__audioChunks.push(b64); };
                r.readAsDataURL(evt.data);
              }
            };
            masterRecorder.start(1000);
            window.__meetingMediaRecorder = masterRecorder;
          } catch (e) {}
          return masterDest;
        };
        const origConnect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (target) {
          try {
            if (this.context) {
              if (this.context.state === 'suspended') this.context.resume().catch(() => {});
              const rd = initRecorder(this.context);
              if (rd && target === this.context.destination && this !== rd) origConnect.call(this, rd);
            }
          } catch (e) {}
          return origConnect.apply(this, arguments);
        };
      } catch (e) {}
    }).catch(() => {});

    console.log(`[bot.service] Navigating to ${meetingUrl}`);
    await page.goto(meetingUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    // Join the meeting
    if (meetingUrl.includes('meet.google.com')) {
      await handleGoogleMeetJoin(page, botName);
    } else if (meetingUrl.includes('zoom.us')) {
      await handleZoomJoin(page, botName);
    }

    bot.status = 'recording';
    console.log(`[bot.service] Bot recording: ${meetingId}`);

    let elapsed = 0;
    const checkInterval = setInterval(async () => {
      try {
        if (!activeBots.has(meetingId)) { clearInterval(checkInterval); return; }
        if (page.isClosed() || !browser.isConnected()) {
          clearInterval(checkInterval);
          await stopMeetingBot(meetingId);
          return;
        }
        elapsed += 2000;

        // Try to enable Google Meet captions
        if (meetingUrl.includes('meet.google.com')) {
          await page.evaluate(() => {
            document.querySelectorAll('button[aria-label*="caption" i], button[data-tooltip*="caption" i], button[jsname="r8qRAd"]').forEach((b) => {
              if (b.getAttribute('aria-pressed') !== 'true') b.click();
            });
          }).catch(() => {});
        }

        // Dismiss consent dialogs
        await page.evaluate(() => {
          Array.from(document.querySelectorAll('button, div[role=button]')).forEach((b) => {
            const t = (b.textContent || '').toLowerCase().trim();
            if (t === 'join audio' || t === 'join with computer audio' || t === 'got it' || t === 'accept' || t === 'agree') b.click();
          });
        }).catch(() => {});

        // Detect meeting end
        const url = page.url();
        const ended = url.includes('postattendee') || url.includes('meeting/ended') || url.includes('landing');
        const bodyEnded = await page.evaluate(() => {
          const t = (document.body && document.body.innerText ? document.body.innerText : '').toLowerCase();
          return t.includes('meeting has been ended') || t.includes('you left the meeting') || t.includes('the host has ended');
        }).catch(() => false);

        if (ended || bodyEnded) {
          console.log(`[bot.service] Meeting ended for ${meetingId}. Processing...`);
          clearInterval(checkInterval);
          await stopMeetingBot(meetingId);
        }
      } catch (e) {}
    }, 2000);

    setTimeout(async () => {
      if (activeBots.has(meetingId)) { clearInterval(checkInterval); await stopMeetingBot(meetingId); }
    }, 45 * 60 * 1000);
  } catch (err) {
    console.warn(`[bot.service] Lifecycle error for ${meetingId}:`, err.message);
  }
}

async function handleGoogleMeetJoin(page, botName) {
  try {
    const nameInputSelector = 'input[type="text"]';
    await page.waitForSelector(nameInputSelector, { timeout: 12000 });
    // Clear any existing value then type the bot name
    await page.click(nameInputSelector, { clickCount: 3 });
    await page.type(nameInputSelector, botName, { delay: 50 });
    await new Promise((r) => setTimeout(r, 600));

    // Click Ask to Join / Join Now
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, div[role='button']"));
      const btn = btns.find((b) => {
        const t = (b.textContent || "").toLowerCase().trim();
        return t.includes("ask to join") || t.includes("join now") || t === "join";
      });
      if (btn) btn.click();
    });

    console.log("[bot.service] Google Meet join attempted");
  } catch (e) {
    console.log("[bot.service] Google Meet join error:", e.message);
  }
}

async function handleZoomJoin(page, botName) {
  try {
    const nameSelector = '#inputname, input[placeholder*="name" i], input[type="text"]';
    await page.waitForSelector(nameSelector, { timeout: 15000 });
    await page.click(nameSelector, { clickCount: 3 });
    await page.type(nameSelector, botName, { delay: 50 });
    await new Promise((r) => setTimeout(r, 500));

    await page.evaluate(() => {
      const btn = document.querySelector("#joinBtn, button[type='submit'], .preview-join-button");
      if (btn) { btn.click(); return; }
      const btns = Array.from(document.querySelectorAll("button"));
      const jb = btns.find((b) => (b.textContent || "").toLowerCase().includes("join"));
      if (jb) jb.click();
    });

    await new Promise((r) => setTimeout(r, 3000));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, div[role='button']"));
      const ab = btns.find((b) => {
        const t = (b.textContent || "").toLowerCase();
        return t.includes("join audio") || t.includes("computer audio") || t.includes("join with computer audio");
      });
      if (ab) ab.click();
    }).catch(() => {});

    console.log("[bot.service] Zoom join attempted");
  } catch (e) {
    console.log("[bot.service] Zoom join error:", e.message);
  }
}

async function stopMeetingBot(meetingId) {
  const bot = activeBots.get(meetingId);
  if (!bot) return { success: false, message: 'Bot not found' };

  console.log(`[bot.service] Stopping bot for meeting ${meetingId}`);
  bot.status = 'processing';

  let audioBuffer = null;
  let liveTranscript = [];

  if (bot.page && !bot.page.isClosed()) {
    try {
      const extracted = await bot.page.evaluate(async () => {
        if (window.__meetingMediaRecorder && window.__meetingMediaRecorder.state !== 'inactive') {
          window.__meetingMediaRecorder.stop();
          await new Promise((r) => setTimeout(r, 700));
        }
        return { chunks: window.__audioChunks || [], captions: window.__liveTranscript || [] };
      });

      if (extracted.chunks && extracted.chunks.length > 0) {
        audioBuffer = Buffer.concat(extracted.chunks.map((b64) => Buffer.from(b64, 'base64')));
        console.log(`[bot.service] Audio captured: ${audioBuffer.length} bytes`);
      }
      if (extracted.captions && extracted.captions.length > 0) {
        liveTranscript = extracted.captions;
        console.log(`[bot.service] Captions captured: ${liveTranscript.length} blocks`);
      }
    } catch (e) {
      console.warn('[bot.service] Extract error:', e.message);
    }
  }

  try { if (bot.browser) await bot.browser.close().catch(() => {}); } catch (e) {}
  activeBots.delete(meetingId);

  try {
    const preloadedTranscript = liveTranscript.length > 0 ? {
      raw_text: liveTranscript.map((t) => `${t.speaker}: ${t.text}`).join('. '),
      diarized_json: liveTranscript,
    } : null;

    const result = await processMeetingAudio({
      meetingId,
      teamId: bot.teamId,
      audioData: audioBuffer,
      preloadedTranscript,
    });

    return { success: true, meetingId, status: 'completed', result };
  } catch (err) {
    console.error(`[bot.service] Pipeline error for ${meetingId}:`, err);
    return { success: false, error: err.message };
  }
}

function getActiveBots() {
  const list = [];
  for (const [id, bot] of activeBots.entries()) {
    list.push({ meetingId: id, teamId: bot.teamId, status: bot.status, startedAt: bot.startedAt });
  }
  return list;
}

module.exports = { joinMeeting, stopMeetingBot, getActiveBots };
