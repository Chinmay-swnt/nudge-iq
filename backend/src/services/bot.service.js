const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const { supabase } = require("./supabase.service");
const { processMeetingAudio } = require("./pipeline.service");

// Active bots map: meetingId -> { browser, page, status, startedAt }
const activeBots = new Map();

/**
 * Converts standard Zoom app links to web client join links
 */
function formatZoomWebUrl(meetingUrl) {
  try {
    const urlObj = new URL(meetingUrl);
    if (urlObj.hostname.includes("zoom.us")) {
      // Extract meeting ID from /j/123456789
      const match = urlObj.pathname.match(/\/j\/(\d+)/);
      if (match && match[1]) {
        const meetingId = match[1];
        const pwd = urlObj.searchParams.get("pwd") || "";
        const pwdParam = pwd ? `?pwd=${encodeURIComponent(pwd)}` : "";
        return `https://app.zoom.us/wc/${meetingId}/join${pwdParam}`;
      }
    }
  } catch (e) {}
  return meetingUrl;
}

/**
 * Dispatches a headless bot to record a virtual meeting (Google Meet, Zoom, Teams)
 * @param {Object} params
 * @param {string} params.meetingUrl
 * @param {string} params.teamId
 * @param {string} params.title
 * @param {string} [params.botName]
 * @returns {Promise<Object>}
 */
async function joinMeeting({ meetingUrl, teamId, title, botName = "NudgeIQ Note Taker" }) {
  console.log(`[bot.service] Dispatching bot to ${meetingUrl} for team ${teamId}`);

  // 1. Create meeting entry in Supabase if not existing
  let meetingId = null;
  if (supabase) {
    const { data: newMeeting } = await supabase
      .from("meetings")
      .insert({
        team_id: teamId,
        title: title || `Recorded Meeting (${new URL(meetingUrl).hostname})`,
        meeting_date: new Date().toISOString(),
        status: "pending",
      })
      .select()
      .single();

    if (newMeeting) {
      meetingId = newMeeting.id;
    }
  }

  if (!meetingId) {
    meetingId = `meeting-${Date.now()}`;
  }

  // Transform Zoom link to Web Client link
  const targetUrl = formatZoomWebUrl(meetingUrl);

  // 2. Launch browser
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--disable-blink-features=AutomationControlled",
        "--autoplay-policy=no-user-gesture-required",
        "--window-size=1280,720",
      ],
    });

    const context = browser.defaultBrowserContext();
    try {
      await context.overridePermissions(new URL(targetUrl).origin, [
        "microphone",
        "camera",
      ]);
    } catch (e) {}

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    activeBots.set(meetingId, {
      browser,
      page,
      teamId,
      meetingId,
      status: "joining",
      startedAt: Date.now(),
    });

    // Handle Google Meet / Zoom in background
    runBotLifecycle(meetingId, page, browser, targetUrl, botName, teamId).catch((err) => {
      console.error(`[bot.service] Lifecycle error for ${meetingId}:`, err);
    });

    return {
      success: true,
      meetingId,
      status: "joining",
      message: `Bot dispatched to ${meetingUrl}`,
    };
  } catch (err) {
    console.error("[bot.service] Failed to launch bot:", err);
    throw err;
  }
}

async function runBotLifecycle(meetingId, page, browser, meetingUrl, botName, teamId) {
  try {
    const bot = activeBots.get(meetingId);
    if (!bot) return;

    // Inject WebAudio & MediaElement audio tap before page navigation so it catches all audio streams from start
    await page.evaluateOnNewDocument(() => {
      window.__audioChunks = [];
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        let masterDest = null;
        let masterRecorder = null;

        const initRecorder = (ctx) => {
          if (masterDest) return masterDest;
          try {
            masterDest = ctx.createMediaStreamDestination();
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
              ? "audio/webm;codecs=opus"
              : MediaRecorder.isTypeSupported("audio/webm")
              ? "audio/webm"
              : "audio/ogg";

            masterRecorder = new MediaRecorder(masterDest.stream, { mimeType });
            masterRecorder.ondataavailable = (evt) => {
              if (evt.data && evt.data.size > 0) {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const b64 = (reader.result || "").split(",")[1];
                  if (b64) window.__audioChunks.push(b64);
                };
                reader.readAsDataURL(evt.data);
              }
            };
            masterRecorder.start(1000);
            window.__meetingMediaRecorder = masterRecorder;
          } catch (e) {}
          return masterDest;
        };

        // Hook AudioNode.connect to tap all audio routing to speakers
        const origConnect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (target) {
          try {
            if (this.context) {
              if (this.context.state === "suspended") {
                this.context.resume().catch(() => {});
              }
              const recDest = initRecorder(this.context);
              if (recDest && target === this.context.destination && this !== recDest) {
                origConnect.call(this, recDest);
              }
            }
          } catch (e) {}
          return origConnect.apply(this, arguments);
        };
      } catch (err) {}
    }).catch(() => {});

    console.log(`[bot.service] Navigating to ${meetingUrl}`);
    await page.goto(meetingUrl, { waitUntil: "networkidle2", timeout: 45000 });

    // Google Meet Flow
    if (meetingUrl.includes("meet.google.com")) {
      await handleGoogleMeetJoin(page, botName);
    }
    // Zoom Web Client Flow
    else if (meetingUrl.includes("zoom.us")) {
      await handleZoomJoin(page, botName);
    }

    bot.status = "recording";
    console.log(`[bot.service] Bot successfully joined and recording: ${meetingId}`);

    // Post-join monitor: continuously clicks "Join Audio", "Got it", "Agree" and checks for meeting end
    let elapsed = 0;
    const checkInterval = setInterval(async () => {
      try {
        if (!activeBots.has(meetingId)) {
          clearInterval(checkInterval);
          return;
        }

        if (page.isClosed() || !browser.isConnected()) {
          console.log(`[bot.service] Page/Browser closed for ${meetingId}. Ending recording.`);
          clearInterval(checkInterval);
          await stopMeetingBot(meetingId);
          return;
        }

        elapsed += 2000;

        // Auto-click Zoom Audio / Consent dialogs for the first 60 seconds of the call
        if (elapsed <= 60000) {
          await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll("button, div[role='button'], a"));
            for (const b of buttons) {
              const txt = (b.textContent || "").toLowerCase().trim();
              if (
                txt.includes("join audio") ||
                txt.includes("computer audio") ||
                txt.includes("join with computer audio") ||
                txt.includes("join by computer") ||
                txt.includes("got it") ||
                txt.includes("i agree") ||
                txt.includes("agree") ||
                txt.includes("accept")
              ) {
                b.click();
              }
            }
          }).catch(() => {});
        }

        // Check page content & URL for meeting-ended signals
        const currentUrl = page.url();
        const isEndedUrl =
          currentUrl.includes("postattendee") ||
          currentUrl.includes("meeting/ended") ||
          currentUrl.includes("landing");

        const hasEndedText = await page.evaluate(() => {
          const bodyText = (document.body?.innerText || "").toLowerCase();
          return (
            bodyText.includes("this meeting has been ended by host") ||
            bodyText.includes("this meeting has ended") ||
            bodyText.includes("the host has ended the meeting") ||
            bodyText.includes("you have been removed") ||
            bodyText.includes("you left the meeting") ||
            bodyText.includes("return to home screen")
          );
        }).catch(() => false);

        if (isEndedUrl || hasEndedText) {
          console.log(`[bot.service] Meeting ended signal detected for ${meetingId}. Stopping bot and triggering AI...`);
          clearInterval(checkInterval);
          await stopMeetingBot(meetingId);
        }
      } catch (e) {}
    }, 2000);

    // Set auto-stop safeguard after 45 minutes
    setTimeout(async () => {
      if (activeBots.has(meetingId)) {
        clearInterval(checkInterval);
        await stopMeetingBot(meetingId);
      }
    }, 45 * 60 * 1000);
  } catch (err) {
    console.warn(`[bot.service] Error during join automation for ${meetingId}:`, err.message);
  }
}

async function handleGoogleMeetJoin(page, botName) {
  try {
    const nameInputSelector = 'input[type="text"]';
    await page.waitForSelector(nameInputSelector, { timeout: 10000 });
    await page.type(nameInputSelector, botName, { delay: 50 });

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, div[role='button']"));
      const joinBtn = buttons.find((b) => {
        const txt = (b.textContent || "").toLowerCase();
        return txt.includes("ask to join") || txt.includes("join now") || txt.includes("join");
      });
      if (joinBtn) joinBtn.click();
    });
  } catch (e) {
    console.log("[bot.service] Google meet join selector bypass:", e.message);
  }
}

async function handleZoomJoin(page, botName) {
  try {
    const nameInputSelector = '#inputname, input[placeholder*="name" i], input[type="text"]';
    await page.waitForSelector(nameInputSelector, { timeout: 15000 });
    await page.type(nameInputSelector, botName, { delay: 50 });

    // Click Join button
    await page.evaluate(() => {
      const joinBtn = document.querySelector("#joinBtn, button[type='submit'], .preview-join-button");
      if (joinBtn) {
        joinBtn.click();
      } else {
        const buttons = Array.from(document.querySelectorAll("button"));
        const btn = buttons.find((b) => (b.textContent || "").toLowerCase().includes("join"));
        if (btn) btn.click();
      }
    });

    // Wait 3s and click "Join Audio by Computer" if immediately present
    await new Promise((r) => setTimeout(r, 3000));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, div[role='button']"));
      const audioBtn = btns.find((b) => {
        const t = (b.textContent || "").toLowerCase();
        return t.includes("join audio") || t.includes("computer audio") || t.includes("join with computer audio");
      });
      if (audioBtn) audioBtn.click();
    }).catch(() => {});
  } catch (e) {
    console.log("[bot.service] Zoom join selector bypass:", e.message);
  }
}

/**
 * Stops bot recording and triggers the AI pipeline
 * @param {string} meetingId
 */
async function stopMeetingBot(meetingId) {
  const bot = activeBots.get(meetingId);
  if (!bot) {
    return { success: false, message: "Bot not found or already stopped" };
  }

  console.log(`[bot.service] Stopping bot for meeting ${meetingId}`);
  bot.status = "processing";

  let audioBuffer = null;
  if (bot.page && !bot.page.isClosed()) {
    try {
      const chunks = await bot.page.evaluate(async () => {
        if (window.__meetingMediaRecorder && window.__meetingMediaRecorder.state !== "inactive") {
          window.__meetingMediaRecorder.stop();
          await new Promise((r) => setTimeout(r, 600));
        }
        return window.__audioChunks || [];
      });

      if (chunks && chunks.length > 0) {
        audioBuffer = Buffer.concat(chunks.map((b64) => Buffer.from(b64, "base64")));
        console.log(`[bot.service] Captured real meeting audio stream (${audioBuffer.length} bytes)`);
      }
    } catch (e) {
      console.warn("[bot.service] Could not extract audio chunks:", e.message);
    }
  }

  try {
    if (bot.browser) {
      await bot.browser.close().catch(() => {});
    }
  } catch (e) {}

  activeBots.delete(meetingId);

  // Trigger processing pipeline
  try {
    const result = await processMeetingAudio({
      meetingId,
      teamId: bot.teamId,
      audioData: audioBuffer || Buffer.from("no_audio_captured"),
    });

    return {
      success: true,
      meetingId,
      status: "completed",
      result,
    };
  } catch (err) {
    console.error(`[bot.service] Error processing meeting ${meetingId}:`, err);
    return { success: false, error: err.message };
  }
}

function getActiveBots() {
  const list = [];
  for (const [id, bot] of activeBots.entries()) {
    list.push({
      meetingId: id,
      teamId: bot.teamId,
      status: bot.status,
      startedAt: bot.startedAt,
    });
  }
  return list;
}

module.exports = {
  joinMeeting,
  stopMeetingBot,
  getActiveBots,
};
