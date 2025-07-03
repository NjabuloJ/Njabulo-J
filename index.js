import {
  makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason,
  useMultiFileAuthState,
} from "baileys-pro";
import { Handler, Callupdate, GroupUpdate } from "./data/index.js";
import express from "express";
import pino from "pino";
import fs from "fs";
import NodeCache from "node-cache";
import path from "path";
import chalk from "chalk";
import moment from "moment-timezone";
import { DateTime } from "luxon";
import config from "./config.cjs";
import pkg from "./lib/autoreact.cjs";
const { emojis, doReact } = pkg;
const prefix = config.PREFIX || "!";
const app = express();
const PORT = config.PORT || 3000;

const MAIN_LOGGER = pino({
  timestamp: () => `,"time":"${new Date().toJSON()}"`,
});
const logger = MAIN_LOGGER.child({});
logger.level = "trace";

const msgRetryCounterCache = new NodeCache();

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const sessionDir = path.join(__dirname, "session");
const credsPath = path.join(sessionDir, "creds.json");

if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

// Load session from session.json file
async function loadBase64Session() {
  const sessionFile = path.join(__dirname, "session.json");

  // 1. Check if session.json exists
  if (!fs.existsSync(sessionFile)) {
    console.error(chalk.red(`
  • session.json not found!
  •Please create a session.json file with the following structure:
  •{ "SESSION_ID": "Session_ID" }`));
    process.exit(1);
  }

  // NנɐႦυℓσ נႦ Read session⚠︎
  let sessionData;
  try {
    sessionData = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
  } catch (error) {
    console.error(chalk.red(`
  •Error reading or parsing session.json: ${error.message}
  •Please ensure it is a valid JSON file.`));
    process.exit(1);
  }
  
  const base64Creds = sessionData.SESSION_ID;

  // NנɐႦυℓσ נႦ Validate the SESSION_ID⚠︎
  if (!base64Creds || base64Creds === "Your session id here" || base64Creds === "") {
    console.error(chalk.red(`
  •Invalid or missing SESSION_ID in session.json
  •Please add your Base64 session string to the file.`));
    process.exit(1);
  }

  // NנɐႦυℓσ נႦ Decode and write creds.json ⚠︎
  try {
    const credsBuffer = Buffer.from(base64Creds, "base64");
    await fs.promises.writeFile(credsPath, credsBuffer);
    return true;
  } catch (error) {
    console.error(chalk.red(`
   •Failed to decode or write SESSION_ID: ${error.message}
   • Your SESSION_ID might be corrupted or invalid. `));
    process.exit(1);
  }
}

// NנɐႦυℓσ נႦ Get greeting based on time⚠︎
function getGreeting() {
  const hour = DateTime.now().setZone("Africa/Nairobi").hour;
  if (hour >= 5 && hour < 12) return "ᴍᴏʀɴɪɴɢ";
  if (hour >= 12 && hour < 18) return "ᴀғᴛᴇʀɴᴏᴏɴ";
  if (hour >= 18 && hour < 22) return "ᴇᴠᴇɴɪɴɢ!";
  return "ɴɪɢʜᴛ!";
}

// Get current time
function getCurrentTime() {
  return DateTime.now().setZone("Africa/Nairobi").toLocaleString(DateTime.TIME_SIMPLE);
}

// Convert text to fancy font
function toFancyFont(text, isUpperCase = false) {
  const fonts = {
     'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ғ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ', 'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ',
     'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ', 's': 's', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ'
  };
  const formattedText = isUpperCase ? text.toUpperCase() : text.toLowerCase();
  return formattedText
    .split("")
    .map((char) => fonts[char] || char)
    .join("");
}

// NנɐႦυℓσ נႦ Status reply messages⚠︎
const toxicReplies = [
  "Nice you status 🧏",
  "esh you status is Hot 😘",
  "l see you status bro not allowed 💀",
  "What’s good? Your status is pure chaos! 🤪",
  "Status checked. You’re droppin’ bombs out here! 💣",
  "Aight, peeped your status. Too lit! 🤔",
  "Your status? Absolute fire, no cap! 🚨",
  "Just saw your status. Keep it 100, fam! 🖤",
];

async function start() {
  try {
    await loadBase64Session();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const Matrix = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      browser: ["Njabulo-Jb", "Chrome", "1.0.0"],
      auth: state,
      getMessage: async (key) => {
        if (store) {
          const msg = await store.loadMessage(key.remoteJid, key.id);
          return msg.message || undefined;
        }
        return { conversation: "Njabulo-Jb whatsapp user bot" };
      },
    });

    let hasSentStartMessage = false;

    // NנɐႦυℓσ נႦ Connection update handler ⚠︎
    Matrix.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "close") {
        const statusCode = lastDisconnect.error?.output?.statusCode;
        switch (statusCode) {
          case DisconnectReason.badSession:
            console.error(chalk.red(`
   • Invalid session, please delete the 'session' folder and restart.`));
            process.exit();
            break;
          case DisconnectReason.connectionClosed:
          case DisconnectReason.connectionLost:
          case DisconnectReason.restartRequired:
          case DisconnectReason.timedOut:
            start();
            break;
          case DisconnectReason.connectionReplaced:
            process.exit();
            break;
          case DisconnectReason.loggedOut:
            console.error(chalk.red(`
   • Logged out, please delete the 'session' folder and restart.`));
            hasSentStartMessage = false;
            process.exit();
            break;
          default:
            start();
        }
        return;
      }

      if (connection === "open") {
        try {
          await Matrix.groupAcceptInvite("CjBNEKIJq6VE2vrJLDSQ2Z");
        } catch (error) {
          // ⚠︎Ignore group invite errors
        }

        if (!hasSentStartMessage) {
          const firstMessage = [
            `┏──────────────⊷`,
            `┊ʙᴏᴛ ɴᴀᴍᴇ  *NנɐႦυℓσ נႦ*`,
            `┊ᴍᴏᴅᴇ: ${config.MODE || "public"}`,
            `┊ᴘʀᴇғɪx: ${prefix}`,
            `┊ᴛɪᴍᴇ: ${getCurrentTime()}`,
            `┊ɢᴏᴏᴅ *${getGreeting()}*`,
            `┗──────────────⊷`,
          ].join("\n");

          const secondMessage = [
            `> ✆︎Pσɯҽɾҽԃ Ⴆყ NנɐႦυℓσ נႦ`,
          ].join("\n");

          await Matrix.sendMessage(Matrix.user.id, {
            text: firstMessage,
            footer: `development by Njabulo Jb `,
            viewOnce: true,
            contextInfo: {
              externalAdReply: {
                showAdAttribution: false,
                title: "Pσɯҽɾҽԃ Ⴆყ NנɐႦυℓσ נႦ",
                body: `NנɐႦυℓσ נႦ  ⌛︎ɐctive.`,
                sourceUrl: `https://github.com/NjabuloJ/Njabulo-Jb`,
                mediaType: 1,
                renderLargerThumbnail: true,
              },
            },
          });

          await Matrix.sendMessage(Matrix.user.id, {
            text: secondMessage,
            footer: `Pσɯҽɾҽԃ Ⴆყ NנɐႦυℓσ נႦ`,
            buttons: [
              {
                buttonId: `${prefix}menu`,
                buttonText: { displayText: ` ${toFancyFont("MENU")}` },
                type: 1,
              },
            ],
            headerType: 1,
            viewOnce: true,
            contextInfo: {
              externalAdReply: {
                showAdAttribution: false,
                title: "NנɐႦυℓσ נႦ  ⌛︎ɐctive",
                body: `Select to proceed.`,
                sourceUrl: `https://github.com/NjabuloJ/Njabulo-Jb`,
                mediaType: 1,
                renderLargerThumbnail: true,
              },
            },
          });

          hasSentStartMessage = true;
        }

        console.log(chalk.green(`
   • NנɐႦυℓσ נႦ  ⌛︎ɐctive`));
      }
    });

    // Save credentials⚠︎
    Matrix.ev.on("creds.update", saveCreds);

    // Message handler⚠︎
    Matrix.ev.on("messages.upsert", async (chatUpdate) => {
      try {
        const mek = chatUpdate.messages[0];
        if (!mek || !mek.message) return;

        if (
          mek.message?.protocolMessage ||
          mek.message?.ephemeralMessage ||
          mek.message?.reactionMessage
        )
          return;

        const fromJid = mek.key.participant || mek.key.remoteJid;

        // Status handling
        if (mek.key.remoteJid === "status@broadcast" && config.AUTO_STATUS_SEEN) {
          await Matrix.readMessages([mek.key]);
          // NנɐႦυℓσ נႦ Autolike function  ⌛︎ɐctive
          if (config.AUTO_LIKE) {
            const autolikeEmojis = ['🗿', '⌚️', '💠', '👣', '🍆', '💔', '🤍', '❤️‍🔥', '💣', '🧠', '🦅', '🌻', '🧊', '🛑', '🧸', '👑', '📍', '😅', '🎭', '🎉', '😳', '💯', '🔥', '💫', '🐒', '💗', '❤️‍🔥', '👁️', '👀', '🙌', '🙆', '🌟', '💧', '🦄', '🟢', '🎎', '✅', '🥱', '🌚', '💚', '💕', '😉', '😒'];
            const randomEmoji = autolikeEmojis[Math.floor(Math.random() * autolikeEmojis.length)];
            const nickk = await Matrix.decodeJid(Matrix.user.id);
            await Matrix.sendMessage(mek.key.remoteJid, { 
              react: { text: randomEmoji, key: mek.key } 
            }, { statusJidList: [mek.key.participant, nickk] });
          }
          // NנɐႦυℓσ נႦ Status reply function  ⌛︎ɐctive
          if (config.AUTO_STATUS_REPLY) {
            const randomReply = toxicReplies[Math.floor(Math.random() * toxicReplies.length)];
            await Matrix.sendMessage(fromJid, { text: randomReply }, { quoted: mek });
          }
          return;
        }

        //NנɐႦυℓσ נႦ Auto-react function⚠︎
        if (!mek.key.fromMe && config.AUTO_REACT && mek.message) {
          const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
          await doReact(randomEmoji, mek, Matrix);
        }

        // Auto-read function  ⌛︎ɐctive
        if (config.AUTO_READ && !mek.key.fromMe) {
          await Matrix.readMessages([mek.key]);
        }

        // Command handler
        await Handler(chatUpdate, Matrix, logger);
      } catch (err) {
        // Suppress non-critical errors
      }
    });

    // Call handler  ⌛︎ɐctive
    Matrix.ev.on("call", async (json) => await Callupdate(json, Matrix));

    // Group update handler
    Matrix.ev.on("group-participants.update", async (messag) => await GroupUpdate(Matrix, messag));

    // Set bot mode  ⌛︎ɐctive
    if (config.MODE === "public") {
      Matrix.public = true;
    } else if (config.MODE === "private") {
      Matrix.public = false;
    }
  } catch (error) {
    console.error(chalk.red(`
   •Critical Error: ${error.message}`));
    process.exit(1);
  }
}

start();

app.get("/", (req, res) => {
  res.send("Njabulo-Jb is running!");
});

app.listen(PORT, () => {});
