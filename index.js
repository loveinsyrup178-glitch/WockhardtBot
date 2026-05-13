// =====================================
// WOCKHARDT — ADVANCED TEMP VC SYSTEM v2 (WORKING)
// JOIN-TO-CREATE + PRIVATE PANEL TEXT
// Buttons: LOCK • UNLOCK • LIMIT • RENAME • CLAIM
// Extra: PULL PANEL (command + button)
// Staff can also use controls
// NEW: -dm <roleid> <message> | -dmhere <message>
// =====================================

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");

// ----------------------
// CONFIG
// ----------------------
const PREFIX = "-";
const CLEAR_PREFIX = "#";

// USER WHOSE MESSAGES WILL BE DELETED
const OWNER_USER_ID = "1277264433823088692";

// join-to-create VOICE channel
const CREATE_VC_ID = process.env.CREATE_VC_ID || "1451498864350859264";

// temp category (MUST be a category id)
const CATEGORY_ID = process.env.CATEGORY_ID || "1411585822708469861";

// temp VC naming
const TEMP_NAME = process.env.TEMP_NAME || "💜・{username}";

// optional: staff roles (comma separated role ids)
const STAFF_ROLE_IDS = (process.env.STAFF_ROLE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// DM config
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;

// ----------------------
// CLIENT
// ----------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// key = vcId -> { ownerId, vcId, textId, panelMsgId }
const tempVCs = new Map();

function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  if (STAFF_ROLE_IDS.length && STAFF_ROLE_IDS.some((id) => member.roles.cache.has(id))) return true;
  return false;
}

function safeName(str, max = 90) {
  return (str || "temp").replace(/[\n\r\t]/g, " ").slice(0, max);
}

// ----------------------
// PANEL (buttons)
// ----------------------
function panelRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("lock").setLabel("🔒 Lock").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("unlock").setLabel("🔓 Unlock").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("limit").setLabel("👥 Limit").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("rename").setLabel("✏️ Rename").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("claim").setLabel("👑 Claim").setStyle(ButtonStyle.Success)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("pull_panel").setLabel("📌 Pull Panel").setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

function controlPanelPayload(ownerId, vcId) {
  return {
    content:
      `💜 **Temp VC created for <@${ownerId}>**\n` +
      `🔊 <#${vcId}>\n\n` +
      `**Controls:** Lock / Unlock / Limit / Rename / Claim\n` +
      `📌 Use **${PREFIX}panel** anytime to pull this again.`,
    allowedMentions: { users: [ownerId] },
    components: panelRows(),
  };
}

// ----------------------
// DM HELPER
// ----------------------
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMassDM(member, targets, messageContent, replyMsg) {
  let success = 0;
  let failed = 0;
  let dmsClosed = 0;

  for (const target of targets) {
    if (target.bot) continue;
    try {
      await target.send(messageContent);
      success++;
      await sleep(1000); // rate limit protection
    } catch (err) {
      if (err.code === 50007) {
        dmsClosed++;
      } else {
        failed++;
      }
      await sleep(1000);
    }
  }

  const results = [];
  if (success) results.push(`✅ **${success}** sent`);
  if (dmsClosed) results.push(`🔒 **${dmsClosed}** DMs closed`);
  if (failed) results.push(`❌ **${failed}** failed`);

  await replyMsg.edit(`📨 DM Results — ${member.user.username}\n${results.join(" | ")}`);
}

// ----------------------
// READY
// ----------------------
client.once("ready", async () => {
  console.log(`💜 ${client.user.tag} is online`);
});

// ----------------------
// CREATE TEMP VC + PANEL TEXT
// ----------------------
client.on("voiceStateUpdate", async (oldState, newState) => {
  if (newState.channelId === CREATE_VC_ID) {
    const guild = newState.guild;
    const member = newState.member;
    if (!guild || !member) return;

    try {
      const cat = guild.channels.cache.get(CATEGORY_ID);
      if (!cat || cat.type !== ChannelType.GuildCategory) return;

      const me = await guild.members.fetchMe();
      const baseName = safeName(TEMP_NAME.replace("{username}", member.user.username), 90);

      const newVC = await guild.channels.create({
        name: baseName,
        type: ChannelType.GuildVoice,
        parent: CATEGORY_ID,
      });

      const newText = await guild.channels.create({
        name: safeName(`${baseName}-panel`, 90),
        type: ChannelType.GuildText,
        parent: CATEGORY_ID,
      });

      await member.voice.setChannel(newVC).catch(() => {});
      tempVCs.set(newVC.id, { ownerId: member.id, vcId: newVC.id, textId: newText.id });

      await newText.send(controlPanelPayload(member.id, newVC.id));
    } catch (e) {
      console.log("❌ Temp VC error:", e);
    }
  }

  if (oldState.channelId && tempVCs.has(oldState.channelId)) {
    const data = tempVCs.get(oldState.channelId);
    const vc = oldState.guild.channels.cache.get(data.vcId);
    if (vc && vc.members.size === 0) {
      tempVCs.delete(vc.id);
      vc.delete().catch(() => {});
      oldState.guild.channels.cache.get(data.textId)?.delete().catch(() => {});
    }
  }
});

// ----------------------
// COMMANDS
// ----------------------
client.on("messageCreate", async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  const member = await msg.guild.members.fetch(msg.author.id).catch(() => null);
  if (!member) return;

  // -------- PANEL
  if (msg.content === `${PREFIX}panel`) {
    const vc = member.voice?.channel;
    if (!vc) return msg.reply("❌ Join your temp VC.");

    const data = tempVCs.get(vc.id);
    if (!data) return;

    if (msg.author.id !== data.ownerId && !isStaff(member))
      return msg.reply("❌ Only owner or staff.");

    msg.guild.channels.cache.get(data.textId)
      ?.send(controlPanelPayload(data.ownerId, data.vcId));
  }

  // -------- CLEAR OWNER (NEW, SAFE)
  if (msg.content === `${CLEAR_PREFIX}clearowner`) {
    if (!isStaff(member))
      return msg.reply("❌ Staff only.");

    const since = Date.now() - 24 * 60 * 60 * 1000;
    let deleted = 0;

    for (const channel of msg.guild.channels.cache.values()) {
      if (!channel.isTextBased()) continue;

      let messages;
      try {
        messages = await channel.messages.fetch({ limit: 100 });
      } catch {
        continue;
      }

      const targets = messages.filter(
        m =>
          m.author.id === OWNER_USER_ID &&
          m.createdTimestamp >= since
      );

      if (targets.size > 0) {
        await channel.bulkDelete(targets, true).catch(() => {});
        deleted += targets.size;
      }
    }

    msg.reply(`🧹 Deleted **${deleted}** messages from owner.`);
  }

  // -------- DM ROLE (STAFF ONLY)
  if (msg.content.startsWith(`${PREFIX}dm `)) {
    if (!isStaff(member))
      return msg.reply("❌ Staff only.");

    const args = msg.content.slice(`${PREFIX}dm `.length).trim();
    const roleIdMatch = args.match(/^(\d+)\s+(.+)$/s);
    if (!roleIdMatch)
      return msg.reply("Usage: `-dm <roleid> <message>`");

    const [, roleId, messageContent] = roleIdMatch;
    const role = msg.guild.roles.cache.get(roleId);
    if (!role)
      return msg.reply("❌ Role not found.");

    const targets = role.members.map((m) => m);
    if (targets.length === 0)
      return msg.reply("❌ No members in that role.");

    const statusMsg = await msg.reply(`📨 Sending to **${targets.length}** members with role **${role.name}**...`);

    await sendMassDM(member, targets, messageContent, statusMsg);
  }

  // -------- DM VC MEMBERS (STAFF ONLY)
  if (msg.content.startsWith(`${PREFIX}dmhere `)) {
    if (!isStaff(member))
      return msg.reply("❌ Staff only.");

    const messageContent = msg.content.slice(`${PREFIX}dmhere `.length).trim();
    if (!messageContent)
      return msg.reply("Usage: `-dmhere <message>`");

    const vc = member.voice?.channel;
    if (!vc)
      return msg.reply("❌ Join a voice channel first.");

    const targets = vc.members.map((m) => m);
    if (targets.length === 0)
      return msg.reply("❌ No one in this VC.");

    const statusMsg = await msg.reply(`📨 Sending to **${targets.length}** members in **${vc.name}**...`);

    await sendMassDM(member, targets, messageContent, statusMsg);
  }
});

// ----------------------
// LOGIN
// ----------------------
client.login(process.env.TOKEN);
