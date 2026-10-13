/**
 * bot.service.js — NudgeIQ Meeting Bot
 *
 * Designed for reliable joining, clean audio recording, zero-echo isolation,
 * and exact Supabase schema alignment.
 *
 * Supabase `meetings` table schema:
 *   id (UUID), team_id (UUID), title, meeting_date, transcript_url, status, created_at
 *
 * Features:
 * 1. Zero Echo:
 *    - All local microphone tracks disabled at the getUserMedia level.
 *    - Automatically mutes mic (Ctrl+D) and camera (Ctrl+E) in Google Meet.
 *    - The bot is 100% silent in the meeting room — ZERO echo or feedback to host.
 * 2. Multi-layer Audio Capture:
 *    - Intercepts remote participants' WebRTC audio from <audio> elements.
 *    - Tab-level audio streaming via puppeteer-stream.
 *    - Live caption scraper for Google Meet and Zoom as synchronized fallback.
 * 3. File Streaming:
 *    - Streams incoming chunks in real-time to backend/recordings/<meetingId>.webm.
 *    - Uploads .webm to Supabase Storage bucket 'recordings' on completion.
 *    - Cleans up temporary files from disk after processing.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { launch, getStream } = require('puppeteer-stream');
const { supabase, supabaseAdmin } = require('./supabase.service');
const { processMeetingAudio } = require('./pipeline.service');

const activeBots = new Map();

// Local directory for temporary in-progress recordings
const recordingsDir = path.join(__dirname, '..', '..', 'recordings');
if (!fs.existsSync(recordingsDir)) {
  try {
    fs.mkdirSync(recordingsDir, { recursive: true });
  } catch (e) {}
}

/**
 * Format Zoom URL for browser-based web client joining
 */
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

/**
 * Dispatches a bot to a virtual meeting
 */
async function joinMeeting({ meetingUrl, teamId, title, botName = 'NudgeIQ Note Taker' }) {
  console.log(`[bot] Dispatching bot to ${meetingUrl} for team ${teamId}`);

  const client = supabaseAdmin || supabase;
  let meetingId = null;

  // Insert meeting into Supabase using exact schema columns (NO processing_status)
  if (client) {
    try {
      const { data: newMeeting, error: insertError } = await client
        .from('meetings')
        .insert({
          team_id: teamId,
          title: title || `Recorded Meeting (${new URL(meetingUrl).hostname})`,
          meeting_date: new Date().toISOString(),
          status: 'pending',
        })
        .select()
        .single();

      if (insertError) {
        console.error('[bot] Failed to insert meeting in Supabase:', insertError.message);
      } else if (newMeeting) {
        meetingId = newMeeting.id;
        console.log(`[bot] Created meeting record in Supabase: ${meetingId}`);
      }
    } catch (dbErr) {
      console.error('[bot] Supabase insert exception:', dbErr.message);
    }
  }

  // Fallback UUID if DB client unavailable
  if (!meetingId) {
    const crypto = require('crypto');
    meetingId = crypto.randomUUID();
  }

  const targetUrl = formatZoomWebUrl(meetingUrl);

  // File paths for local in-progress recording
  const audioFilePath = path.join(recordingsDir, `${meetingId}.webm`);
  const captionFilePath = path.join(recordingsDir, `${meetingId}.txt`);

  const audioStream = fs.createWriteStream(audioFilePath);
  const captionStream = fs.createWriteStream(captionFilePath, { flags: 'a' });

  try {
    // Launch Chrome — MUTED so no audio output goes to system speakers (zero echo)
    const browser = await launch(puppeteer, {
      headless: 'new',
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--mute-audio',                              // KEY: Prevent ANY audio playback from Chrome to system speakers — no echo
        '--use-fake-ui-for-media-stream',            // Grant mic/cam permissions without dialog
        '--use-fake-device-for-media-stream',        // Provide silent fake mic/cam device
        '--autoplay-policy=no-user-gesture-required',
        '--window-size=1280,720',
        '--disable-notifications',
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

    let audioBytes = 0;
    let captionCount = 0;

    // Expose Node streaming functions into the browser
    await page.exposeFunction('__writeAudioChunk', (b64) => {
      if (!b64) return;
      try {
        const buf = Buffer.from(b64, 'base64');
        audioStream.write(buf);
        audioBytes += buf.length;
      } catch (_) {}
    });

    await page.exposeFunction('__saveCaption', (speaker, text, timestamp) => {
      if (!text) return;
      try {
        captionStream.write(`[${timestamp}] ${speaker}: ${text}\n`);
        captionCount++;
      } catch (_) {}
    });

    // In-browser hooks before any meeting scripts load
    await page.evaluateOnNewDocument(() => {
      // 1. Hide automation flag
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // 2. ZERO ECHO: Provide a healthy, active 0-gain silent microphone stream
      //    (Continuous 0-amplitude PCM stream so Zoom/Meet accepts it as a live mic,
      //     but with ZERO hardware connection and ZERO room audio)
      if (navigator.mediaDevices) {
        try {
          const micCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = micCtx.createOscillator();
          const gain = micCtx.createGain();
          gain.gain.value = 0; // Pure mathematical silence (amplitude 0)
          osc.connect(gain);
          const micDest = micCtx.createMediaStreamDestination();
          gain.connect(micDest);
          try { osc.start(); } catch (_) {}

          navigator.mediaDevices.getUserMedia = async function () {
            return micDest.stream;
          };
        } catch (_) {}
      }

      // 3. ZERO ECHO: Mute all <audio> and <video> elements on the computer,
      //    while recording their incoming remote participant audio stream
      const origPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        // Mute playback so NO sound goes to the computer speakers (breaks echo loop)
        this.muted = true;
        this.volume = 0;

        if (this.srcObject && !this.__tapped) {
          this.__tapped = true;
          try {
            const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((m) =>
              MediaRecorder.isTypeSupported(m)
            ) || '';
            const rec = new MediaRecorder(this.srcObject, {
              mimeType: mimeType || undefined,
              audioBitsPerSecond: 32000,
            });
            rec.ondataavailable = (e) => {
              if (e.data && e.data.size > 50) {
                const fr = new FileReader();
                fr.onloadend = () => {
                  const b64 = (fr.result || '').split(',')[1];
                  if (b64) window.__writeAudioChunk(b64);
                };
                fr.readAsDataURL(e.data);
              }
            };
            rec.start(1000);
          } catch (_) {}
        }
        return origPlay.apply(this, arguments);
      };

      // 4. ZERO ECHO: Divert WebAudio destination to recorder (NEVER to computer speakers)
      const OrigCtx = window.AudioContext || window.webkitAudioContext;
      if (OrigCtx) {
        const PatchedCtx = function (...args) {
          const ctx = new OrigCtx(...args);
          try {
            const recDest = ctx.createMediaStreamDestination();
            const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((m) =>
              MediaRecorder.isTypeSupported(m)
            ) || '';
            const rec = new MediaRecorder(recDest.stream, {
              mimeType: mimeType || undefined,
              audioBitsPerSecond: 32000,
            });
            rec.ondataavailable = (e) => {
              if (e.data && e.data.size > 50) {
                const fr = new FileReader();
                fr.onloadend = () => {
                  const b64 = (fr.result || '').split(',')[1];
                  if (b64) window.__writeAudioChunk(b64);
                };
                fr.readAsDataURL(e.data);
              }
            };
            rec.start(1000);

            const origConnect = AudioNode.prototype.connect;
            AudioNode.prototype.connect = function (target, ...rest) {
              if (target === ctx.destination) {
                // Route ONLY to our recorder destination, NEVER to physical speakers!
                return origConnect.call(this, recDest, ...rest);
              }
              return origConnect.call(this, target, ...rest);
            };
          } catch (_) {}
          return ctx;
        };
        PatchedCtx.prototype = OrigCtx.prototype;
        Object.assign(PatchedCtx, OrigCtx);
        window.AudioContext = window.webkitAudioContext = PatchedCtx;
      }

      // 5. Scrape closed captions every 800ms
      const seenCaptions = new Set();

      // System notification patterns to IGNORE — these are Zoom/Meet UI messages, not speech
      const SYSTEM_NOISE = [
        'you are unmuted', 'you are muted', 'video now stopped', 'video now started',
        'is the host now', 'has left the meeting', 'has joined the meeting', 'has been admitted',
        'your microphone is not working', 'please check your connection', 'use a different mic',
        'your internet connection is unstable', 'recording has started', 'recording has stopped',
        'the meeting is being recorded', 'waiting for the host', 'you have been made',
        'returning to home screen', 'seconds left', "can't join this video call",
        'unable to join', 'meeting code', 'join with computer audio',
        'waiting to be admitted', 'admit', 'the host has ended the meeting',
        'only the host can share', 'someone is sharing', 'your connection is',
      ];

      function isSystemNoise(text) {
        const lower = text.toLowerCase().trim();
        return SYSTEM_NOISE.some((pattern) => lower.includes(pattern)) ||
          lower.length < 5;
      }

      setInterval(() => {
        try {
          // Google Meet caption selectors (current)
          const gmSelectors = [
            '[jsname="tgaKEf"]',
            '[jsname="YSxPC"]',
            'div[jscontroller="D1tHje"]',
            'div[class*="iTTPOb"]',
            'div[class*="nMkdId"]',
            'div[class*="a4bNc"]',
          ];

          // Zoom caption/transcript selectors (current web client)
          const zoomSelectors = [
            '.live-transcription__transcript-text',
            '.live-transcription-transcript-text',
            '[class*="transcript-text"]',
            '[class*="transcriptText"]',
            '.notifi__text',        // Zoom caption bubble text (NOT notification)
            '.caption-data',
            '[class*="caption-data"]',
            '[class*="CaptionText"]',
          ];

          const allSelectors = [...gmSelectors, ...zoomSelectors];
          const containers = document.querySelectorAll(allSelectors.join(','));

          containers.forEach((container) => {
            // Skip Zoom notification toasts (they have class "notification" or "notifi" but NOT transcript content)
            const parentClasses = (container.closest('[class]')?.className || '');
            if (parentClasses.includes('notification') && !parentClasses.includes('transcript')) return;

            const speakerEl = container.querySelector(
              '[jsname="r4nke"], [class*="bh44bd"], [class*="zs75Ib"], .speaker-name, strong, b, [data-sender-name], [class*="sender"], [class*="talker"]'
            );
            const speaker = (speakerEl?.innerText || 'Participant').trim().replace(/\s+/g, ' ');

            let fullText = (container.innerText || '').trim();
            if (speakerEl) fullText = fullText.replace(speakerEl.innerText, '').trim();
            fullText = fullText.replace(/^[:\s]+/, '').trim();

            if (!fullText || isSystemNoise(fullText)) return;

            const key = `${speaker}:${fullText.slice(0, 80)}`;
            if (seenCaptions.has(key)) return;
            seenCaptions.add(key);

            if (seenCaptions.size > 4000) {
              const toRemove = [...seenCaptions].slice(0, 1000);
              toRemove.forEach((k) => seenCaptions.delete(k));
            }

            window.__saveCaption(speaker, fullText, new Date().toLocaleTimeString());
          });
        } catch (_) {}
      }, 800);
    }).catch(() => {});

    activeBots.set(meetingId, {
      browser,
      page,
      teamId,
      meetingId,
      status: 'joining',
      startedAt: Date.now(),
      audioFilePath,
      captionFilePath,
      audioStream,
      captionStream,
      tabStream: null,
      get audioBytes() {
        return audioBytes;
      },
      get captionCount() {
        return captionCount;
      },
    });

    // Run lifecycle asynchronously in background
    runBotLifecycle(meetingId, page, browser, targetUrl, botName, teamId, audioStream).catch((err) => {
      console.error(`[bot] Lifecycle error for ${meetingId}:`, err);
    });

    return { success: true, meetingId, status: 'joining', message: `Bot dispatched to ${meetingUrl}` };
  } catch (err) {
    console.error('[bot] Failed to launch bot:', err);
    throw err;
  }
}

/**
 * Executes the meeting navigation, admission detection, zero-echo muting, and audio recording
 */
async function runBotLifecycle(meetingId, page, browser, meetingUrl, botName, teamId, audioStream) {
  const bot = activeBots.get(meetingId);
  if (!bot) return;

  const client = supabaseAdmin || supabase;

  try {
    console.log(`[bot] Navigating to ${meetingUrl}`);
    await page.goto(meetingUrl, { waitUntil: 'networkidle2', timeout: 45000 }).catch((e) => {
      console.warn(`[bot] Navigation notice: ${e.message.slice(0, 60)}`);
    });

    console.log(`[bot] Page loaded: ${page.url()}`);

    // Join lobby, mute mic/cam, and request entry
    if (meetingUrl.includes('meet.google.com')) {
      await handleGoogleMeetJoin(page, botName);
    } else if (meetingUrl.includes('zoom.us')) {
      await handleZoomJoin(page, botName);
    }

    // Connect tabCapture stream via puppeteer-stream
    const connectTabStream = async (attempts = 3) => {
      for (let i = 0; i < attempts; i++) {
        if (!activeBots.has(meetingId) || page.isClosed()) return;
        try {
          const tabStream = await getStream(page, { audio: true, video: false });
          tabStream.pipe(audioStream, { end: false });
          bot.tabStream = tabStream;
          console.log(`[bot] Tab audio stream connected for ${meetingId}`);
          return;
        } catch (_) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    };
    connectTabStream();

    // Polling: admission check, closed captions, meeting end
    let checkCount = 0;
    const interval = setInterval(async () => {
      try {
        if (!activeBots.has(meetingId)) {
          clearInterval(interval);
          return;
        }

        if (page.isClosed() || !browser.isConnected()) {
          console.log(`[bot] Browser closed for ${meetingId}`);
          clearInterval(interval);
          await stopMeetingBot(meetingId);
          return;
        }

        checkCount++;
        const state = await page.evaluate(() => {
          const body = (document.body?.innerText || '').toLowerCase();
          const hasLeaveBtn = !!document.querySelector(
            'button[aria-label*="leave call" i], button[aria-label*="end call" i], button[jsname="CQylAd"], button[aria-label*="leave meeting" i]'
          );
          const hasPeopleOrChat = !!document.querySelector(
            'button[aria-label*="people" i], button[aria-label*="chat" i], div[aria-label*="participant" i]'
          );
          const isWaiting =
            body.includes('asking to join') ||
            body.includes('someone will let you in') ||
            body.includes('waiting for host') ||
            body.includes('please wait, the meeting host');
          const isRejected =
            body.includes("can't join this video call") ||
            body.includes('unable to join') ||
            body.includes("meeting code isn't valid");

          return { hasLeaveBtn, hasPeopleOrChat, isWaiting, isRejected };
        }).catch(() => ({}));

        if (state.isRejected) {
          const reason = 'Google Meet rejected the bot: The meeting link is invalid, expired, or guest access is disabled.';
          console.warn(`[bot] ${meetingId} entry blocked: ${reason}`);
          bot.status = 'failed';
          bot.errorReason = reason;

          if (client) {
            await client.from('meetings').update({ status: 'failed' }).eq('id', meetingId).catch(() => {});
          }

          clearInterval(interval);
          await stopMeetingBot(meetingId);
          return;
        }

        if (state.hasLeaveBtn || state.hasPeopleOrChat) {
          if (bot.status !== 'recording') {
            bot.status = 'recording';
            console.log(`[bot] Admitted into meeting! Recording active for ${meetingId}`);

            if (client) {
              await client.from('meetings').update({ status: 'recording' }).eq('id', meetingId).catch(() => {});
            }

            // Ensure mic is muted inside call (zero echo)
            if (meetingUrl.includes('meet.google.com')) {
              await page.keyboard.down('Control');
              await page.keyboard.press('d');
              await page.keyboard.up('Control');
            } else if (meetingUrl.includes('zoom.us')) {
              await page.keyboard.down('Alt');
              await page.keyboard.press('a');
              await page.keyboard.up('Alt');
              await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button, div[role="button"], .footer-button__button'));
                const mb = btns.find((b) => {
                  const l = (b.getAttribute('aria-label') || b.textContent || '').toLowerCase().trim();
                  return l === 'mute' || l.includes('mute my microphone') || l === 'mute audio';
                });
                if (mb) mb.click();
              }).catch(() => {});
            }
          }

          // Enable closed captions if available
          if (meetingUrl.includes('meet.google.com')) {
            await page.evaluate(() => {
              const ccBtns = document.querySelectorAll(
                'button[aria-label*="caption" i], button[data-tooltip*="caption" i], button[jsname="r8qRAd"], div[role="button"][aria-label*="caption" i]'
              );
              ccBtns.forEach((b) => {
                if (b.getAttribute('aria-pressed') !== 'true' && b.getAttribute('aria-checked') !== 'true') {
                  b.click();
                }
              });
            }).catch(() => {});
          }
        } else if (state.isWaiting) {
          if (bot.status !== 'waiting_admission') {
            bot.status = 'waiting_admission';
            console.log(`[bot] ${meetingId} waiting in lobby: please click "Admit" in meeting window`);
          }
        }

        // Dismiss standard popups
        await page.evaluate(() => {
          Array.from(document.querySelectorAll('button, div[role=button]')).forEach((b) => {
            const t = (b.textContent || '').toLowerCase().trim();
            if (['join audio', 'join with computer audio', 'got it', 'accept', 'agree', 'dismiss'].includes(t)) {
              b.click();
            }
          });
        }).catch(() => {});

        // Log progress every 30s
        if (checkCount % 12 === 0) {
          console.log(
            `[bot] ${meetingId} (${bot.status}) — audio: ${bot.audioBytes || 0} bytes, captions: ${bot.captionCount || 0}`
          );
        }

        // Detect meeting end
        const url = page.url();
        const ended = url.includes('postattendee') || url.includes('meeting/ended') || url.includes('landing');
        const bodyEnded = await page.evaluate(() => {
          const t = (document.body?.innerText || '').toLowerCase();
          return (
            t.includes('meeting has been ended') ||
            t.includes('you left the meeting') ||
            t.includes('the host has ended') ||
            t.includes("you've been removed") ||
            t.includes('return to home screen')
          );
        }).catch(() => false);

        if (ended || bodyEnded) {
          console.log(`[bot] Meeting end detected for ${meetingId}. Processing...`);
          clearInterval(interval);
          await stopMeetingBot(meetingId);
        }
      } catch (_) {}
    }, 2500);

    // Timeout safety: 45 min
    setTimeout(async () => {
      if (activeBots.has(meetingId)) {
        console.log(`[bot] Maximum meeting duration reached for ${meetingId}`);
        clearInterval(interval);
        await stopMeetingBot(meetingId);
      }
    }, 45 * 60 * 1000);
  } catch (err) {
    console.warn(`[bot] Lifecycle error for ${meetingId}:`, err.message);
  }
}

/**
 * Handles Google Meet guest lobby with zero echo muting
 */
async function handleGoogleMeetJoin(page, botName) {
  console.log('[bot] Entering Google Meet lobby...');
  try {
    // 1. Dismiss any permission alerts
    await page.evaluate(() => {
      document.querySelectorAll('button, div[role="button"]').forEach((b) => {
        const t = (b.textContent || '').toLowerCase().trim();
        if (['dismiss', 'got it', 'close', 'ok'].includes(t)) b.click();
      });
    }).catch(() => {});

    // 2. Mute microphone (Ctrl+D) and camera (Ctrl+E) in lobby so bot makes ZERO sound
    await page.keyboard.down('Control');
    await page.keyboard.press('d');
    await page.keyboard.press('e');
    await page.keyboard.up('Control');
    await new Promise((r) => setTimeout(r, 400));

    // Also click microphone button if it still says "Turn off microphone"
    await page.evaluate(() => {
      document.querySelectorAll('div[role="button"][aria-label*="microphone" i]').forEach((b) => {
        if (!b.getAttribute('aria-label')?.includes('Turn on')) b.click();
      });
      document.querySelectorAll('div[role="button"][aria-label*="camera" i]').forEach((b) => {
        if (!b.getAttribute('aria-label')?.includes('Turn on')) b.click();
      });
    }).catch(() => {});

    // 3. Fill bot name
    const nameSelector = 'input[type="text"], input[aria-label*="name" i], input[placeholder*="name" i]';
    await page.waitForSelector(nameSelector, { timeout: 15000 }).catch(() => null);

    const hasNameInput = await page.$(nameSelector);
    if (hasNameInput) {
      await page.click(nameSelector, { clickCount: 3 }).catch(() => {});
      await page.type(nameSelector, botName, { delay: 40 });
      console.log(`[bot] Entered bot name: ${botName}`);
      await new Promise((r) => setTimeout(r, 600));
    }

    // 4. Click "Ask to join" or "Join now"
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, div[role='button']"));
      const btn = btns.find((b) => {
        const t = (b.textContent || '').toLowerCase().trim();
        return t === 'ask to join' || t === 'join now' || t.startsWith('ask to join') || t.startsWith('join now');
      });
      if (btn) {
        btn.click();
        return (btn.textContent || '').trim();
      }
      return null;
    });

    if (clicked) {
      console.log(`[bot] Clicked join button: "${clicked}"`);
    } else {
      await page.keyboard.press('Enter');
      console.log('[bot] Pressed Enter as join fallback');
    }
  } catch (e) {
    console.warn('[bot] Google Meet join warning:', e.message);
  }
}

/**
 * Handles Zoom web client guest join with zero echo muting
 */
async function handleZoomJoin(page, botName) {
  console.log('[bot] Entering Zoom web client lobby...');
  try {
    const sel = '#inputname, input[placeholder*="name" i], input[type="text"]';
    await page.waitForSelector(sel, { timeout: 15000 }).catch(() => null);
    const inp = await page.$(sel);
    if (inp) {
      await page.click(sel, { clickCount: 3 }).catch(() => {});
      await page.type(sel, botName, { delay: 40 });
      await new Promise((r) => setTimeout(r, 500));
    }

    await page.evaluate(() => {
      const btn = document.querySelector("#joinBtn, button[type='submit'], .preview-join-button");
      if (btn) {
        btn.click();
        return;
      }
      const btns = Array.from(document.querySelectorAll('button'));
      const jb = btns.find((b) => (b.textContent || '').toLowerCase().includes('join'));
      if (jb) jb.click();
    });

    await new Promise((r) => setTimeout(r, 3000));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, div[role='button']"));
      const ab = btns.find((b) => {
        const t = (b.textContent || '').toLowerCase();
        return t.includes('join audio') || t.includes('computer audio');
      });
      if (ab) ab.click();
    }).catch(() => {});

    // Mute microphone immediately in Zoom (Alt + A shortcut)
    await new Promise((r) => setTimeout(r, 1500));
    await page.keyboard.down('Alt');
    await page.keyboard.press('a');
    await page.keyboard.up('Alt');

    // Also click Mute button in Zoom UI if present
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, .footer-button__button'));
      const mb = btns.find((b) => {
        const l = (b.getAttribute('aria-label') || b.textContent || '').toLowerCase();
        return l === 'mute' || l.includes('mute my microphone') || l.includes('mute audio');
      });
      if (mb) mb.click();
    }).catch(() => {});

    console.log('[bot] Zoom join completed and microphone MUTED');
  } catch (e) {
    console.warn('[bot] Zoom join warning:', e.message);
  }
}

/**
 * Stops the meeting bot, flushes audio, uploads to Supabase Storage, and runs the AI pipeline
 */
async function stopMeetingBot(meetingId) {
  const bot = activeBots.get(meetingId);
  if (!bot) return { success: false, message: 'Bot not found' };

  console.log(`[bot] Stopping ${meetingId} — total audio captured: ${bot.audioBytes || 0} bytes`);
  bot.status = 'processing';

  // 1. Destroy tab stream and flush file writes
  if (bot.tabStream) {
    try {
      bot.tabStream.destroy();
    } catch (_) {}
    bot.tabStream = null;
  }

  const flushAudio = new Promise((resolve) => {
    if (bot.audioStream) bot.audioStream.end(resolve);
    else resolve();
  });
  const flushCaptions = new Promise((resolve) => {
    if (bot.captionStream) bot.captionStream.end(resolve);
    else resolve();
  });
  await Promise.all([flushAudio, flushCaptions]);

  // 2. Close browser
  try {
    await bot.browser?.close().catch(() => {});
  } catch (_) {}
  activeBots.delete(meetingId);

  // Allow disk flush
  await new Promise((r) => setTimeout(r, 800));

  // 3. Read recorded audio from disk
  let audioBuffer = null;
  if (fs.existsSync(bot.audioFilePath)) {
    try {
      const stats = fs.statSync(bot.audioFilePath);
      console.log(`[bot] Audio file size on disk: ${stats.size} bytes`);
      if (stats.size > 2000) {
        audioBuffer = fs.readFileSync(bot.audioFilePath);
      }
    } catch (e) {
      console.warn('[bot] Error reading audio file:', e.message);
    }
  }

  // 4. Read captions from disk
  let captionText = '';
  if (fs.existsSync(bot.captionFilePath)) {
    try {
      captionText = fs.readFileSync(bot.captionFilePath, 'utf8').trim();
      console.log(`[bot] Captions captured: ${captionText.length} characters`);
    } catch (e) {
      console.warn('[bot] Error reading captions file:', e.message);
    }
  }

  // 5. Upload audio to Supabase Storage bucket 'recordings'
  const client = supabaseAdmin || supabase;
  if (client && audioBuffer) {
    try {
      const storagePath = `${bot.teamId}/${meetingId}/meeting_recording.webm`;
      await client.storage.createBucket('recordings', { public: false }).catch(() => {});
      const { error: uploadError } = await client.storage
        .from('recordings')
        .upload(storagePath, audioBuffer, {
          contentType: 'audio/webm',
          upsert: true,
        });

      if (!uploadError) {
        console.log(`[bot] Uploaded recording to Supabase Storage: ${storagePath}`);
        // Update meeting row: transcript_url & status = 'uploaded'
        await client
          .from('meetings')
          .update({
            transcript_url: storagePath,
            status: 'uploaded',
          })
          .eq('id', meetingId)
          .catch(() => {});
      } else {
        console.warn('[bot] Supabase storage upload warning:', uploadError.message);
      }
    } catch (err) {
      console.warn('[bot] Supabase upload failed:', err.message);
    }
  }

  // 6. Build preloaded transcript from captions (fallback if audio is silent)
  let preloadedTranscript = null;
  if (captionText.length > 20) {
    preloadedTranscript = {
      raw_text: captionText,
      diarized_json: captionText
        .split('\n')
        .map((line) => {
          const match = line.match(/^\[([^\]]+)\]\s+(.+?):\s+(.+)$/);
          return match
            ? { speaker: match[2], time: match[1], text: match[3] }
            : { speaker: 'Participant', time: '', text: line };
        })
        .filter((x) => x.text),
    };
  }

  // If both audio and captions are empty because the bot was never admitted
  if (!audioBuffer && !preloadedTranscript) {
    const errorMsg =
      bot.errorReason ||
      'No audible speech detected: The bot was not admitted into the meeting by the host, or the meeting ended before discussion began. Ensure the host clicks "Admit" in the meeting window.';
    preloadedTranscript = {
      raw_text: errorMsg,
      diarized_json: [],
    };
  }

  console.log(
    `[bot] Running AI pipeline for ${meetingId}: audioBuffer=${audioBuffer ? audioBuffer.length + ' bytes' : 'none'}, captions=${captionText.length} chars`
  );

  // 7. Run AI pipeline
  let pipelineResult;
  try {
    pipelineResult = await processMeetingAudio({
      meetingId,
      teamId: bot.teamId,
      audioData: audioBuffer,
      preloadedTranscript,
    });
    console.log(`[bot] Pipeline successfully completed for ${meetingId}`);
  } catch (err) {
    console.error(`[bot] Pipeline failed for ${meetingId}:`, err.message);
    pipelineResult = { error: err.message };
  }

  // 8. Clean up local temporary recording files from backend/recordings/
  [bot.audioFilePath, bot.captionFilePath].forEach((filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[bot] Cleaned up temporary local file: ${path.basename(filePath)}`);
      }
    } catch (_) {}
  });

  return {
    success: !pipelineResult?.error,
    meetingId,
    status: 'completed',
    result: pipelineResult,
  };
}

/**
 * Returns list of active bots
 */
function getActiveBots() {
  const list = [];
  for (const [id, bot] of activeBots.entries()) {
    list.push({
      meetingId: id,
      teamId: bot.teamId,
      status: bot.status,
      startedAt: bot.startedAt,
      audioBytes: bot.audioBytes || 0,
      captionCount: bot.captionCount || 0,
    });
  }
  return list;
}

module.exports = { joinMeeting, stopMeetingBot, getActiveBots };
