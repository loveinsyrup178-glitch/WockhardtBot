// =====================================
// WOCKHARDT — ADVANCED TEMP VC SYSTEM v2 (WORKING)
// JOIN-TO-CREATE + PRIVATE PANEL TEXT
// Buttons: LOCK • UNLOCK • LIMIT • RENAME • CLAIM
// Extra: PULL PANEL (command + button)
// Staff can also use controls
// NEW: -dm <message> (ALL) | -dmhere <message> (VC) | -dmuser @name <message> (ONE)
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

const OWNER_USER_ID = "1277264433823088692";
const CREATE_VC_ID = process.env.CREATE_VC_ID || "1451498864350859264";
const CATEGORY_ID = process.env.CATEGORY_ID || "1411585822708469861";
const TEMP_NAME = process.env.TEMP_NAME || "💜・{username}";

const STAFF_ROLE_IDS = (process.env.STAFF_ROLE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DM_DELAY_MS = parseInt(process.env.DM_DELAY_MS) || 1500;
const DM_BATCH_SIZE = parseInt(process.env.DM_BATCH_SIZE) || 100;
const DM_CONCURRENT = parseInt(process.env.DM_CONCURRENT) || 3;
const DM_RETRY_MAX = 3;

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

const tempVCs = new Map();
const activeDMJobs = new Map();

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
// PANEL
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
// FAST DM SYSTEM
// ----------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

async function sendDMWithRetry(user, content, retries = 0) {
  try {
    await user.send(content);
    return { success: true };
  } catch (err) {
    if (err.code === 50007) return { closed: true };
    if (err.code === 429) {
      const wait = (err.retry_after || 5) * 1000;
      await sleep(wait);
      if (retries < DM_RETRY_MAX) return sendDMWithRetry(user, content, retries + 1);
      return { rateLimited: true };
    }
    if (retries < DM_RETRY_MAX) {
      await sleep(2000);
      return sendDMWithRetry(user, content, retries + 1);
    }
    return { failed: true, error: err.message };
  }
}

async function sendMassDMFast(member, targets, messageContent, replyMsg, jobId) {
  let success = 0, failed = 0, dmsClosed = 0, rateLimited = 0;
  const total = targets.length;
  const startTime = Date.now();
  let processed = 0;

  activeDMJobs.set(jobId, { total, success, failed, dmsClosed, active: true });

  for (let i = 0; i < total; i += DM_CONCURRENT) {
    if (!activeDMJobs.get(jobId)?.active) {
      await replyMsg.edit(`🛑 Cancelled. ✅ ${success} | 🔒 ${dmsClosed} | ❌ ${failed} | ⏳ ${rateLimited}`);
      activeDMJobs.delete(jobId);
      return;
    }

    const batch = targets.slice(i, i + DM_CONCURRENT);
    const results = await Promise.all(
      batch.map(async (target) => {
        if (target.bot) return null;
        await sleep(DM_DELAY_MS * (batch.indexOf(target)));
        return sendDMWithRetry(target, messageContent);
      })
    );

    for (const r of results) {
      if (!r) continue;
      processed++;
      if (r.success) success++;
      else if (r.closed) dmsClosed++;
      else if (r.rateLimited) rateLimited++;
      else failed++;
    }

    if (processed % DM_BATCH_SIZE === 0 || i + DM_CONCURRENT >= total) {
      const elapsed = Date.now() - startTime;
      const avg = elapsed / processed;
      const eta = avg * (total - processed);
      const bar = "█".repeat(Math.floor(processed / total * 10)) + "░".repeat(10 - Math.floor(processed / total * 10));

      await replyMsg.edit(
        `📨 **Bulk DM** [${bar}] **${processed}/${total}**\n` +
        `✅ ${success} | 🔒 ${dmsClosed} | ⏳ ${rateLimited} | ❌ ${failed}\n` +
        `⏱️ ${formatTime(elapsed)} elapsed | ~${formatTime(eta)} left`
      ).catch(() => {});
    }

    await sleep(500);
  }

  activeDMJobs.delete(jobId);
  const elapsed = Date.now() - startTime;

  await replyMsg.edit(
    `✅ **Done!** ${total} processed\n` +
    `✅ Sent: **${success}** | 🔒 Closed: **${dmsClosed}** | ⏳ Rate limited: **${rateLimited}** | ❌ Failed: **${failed}**\n` +
    `⏱️ Total: ${formatTime(elapsed)} | Speed: ~${(total / (elapsed / 1000)).toFixed(1)} msgs/sec`
  );
}

// ----------------------
// READY
// ----------------------
client.once("ready", async () => {
  console.log(`💜 ${client.user.tag} online | DM delay: ${DM_DELAY_MS}ms | Concurrent: ${DM_CONCURRENT}`);
});

// ----------------------
// VOICE STATE
// ----------------------
client.on("voiceStateUpdate", async (oldState, newState) => {
  if (newState.channelId === CREATE_VC_ID) {
    const guild = newState.guild, member = newState.member;
    if (!guild || !member) return;
    try {
      const cat = guild.channels.cache.get(CATEGORY_ID);
      if (!cat || cat.type !== ChannelType.GuildCategory) return;
      const baseName = safeName(TEMP_NAME.replace("{username}", member.user.username), 90);
      const newVC = await guild.channels.create({ name: baseName, type: ChannelType.GuildVoice, parent: CATEGORY_ID });
      const newText = await guild.channels.create({ name: safeName(`${baseName}-panel`, 90), type: ChannelType.GuildText, parent: CATEGORY_ID });
      await member.voice.setChannel(newVC).catch(() => {});
      tempVCs.set(newVC.id, { ownerId: member.id, vcId: newVC.id, textId: newText.id });
      await newText.send(controlPanelPayload(member.id, newVC.id));
    } catch (e) { console.log("❌ Temp VC error:", e); }
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
// BUTTONS
// ----------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton() || !interaction.guild) return;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;
  const vc = member.voice?.channel;
  if (!vc) return interaction.reply({ content: "❌ Join your temp VC first.", ephemeral: true });
  const data = tempVCs.get(vc.id);
  if (!data) return interaction.reply({ content: "❌ Not a temp VC.", ephemeral: true });
  const isOwner = interaction.user.id === data.ownerId, staff = isStaff(member);
  if (!isOwner && !staff) return interaction.reply({ content: "❌ Only owner or staff.", ephemeral: true });

  if (interaction.customId === "lock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
    return interaction.reply({ content: "🔒 Locked.", ephemeral: true });
  }
  if (interaction.customId === "unlock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: true });
    return interaction.reply({ content: "🔓 Unlocked.", ephemeral: true });
  }
  if (interaction.customId === "limit") {
    await interaction.reply({ content: "Reply with user limit (0-99).", ephemeral: true });
    const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 30000 }).catch(() => null);
    if (!collected) return;
    const limit = parseInt(collected.first().content);
    if (isNaN(limit) || limit < 0 || limit > 99) return interaction.followUp({ content: "❌ Invalid.", ephemeral: true });
    await vc.setUserLimit(limit);
    return interaction.followUp({ content: `👥 Limit: ${limit || "unlimited"}.`, ephemeral: true });
  }
  if (interaction.customId === "rename") {
    await interaction.reply({ content: "Reply with new name.", ephemeral: true });
    const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 30000 }).catch(() => null);
    if (!collected) return;
    const newName = safeName(collected.first().content, 90);
    await vc.setName(newName);
    return interaction.followUp({ content: `✏️ Renamed to **${newName}**.`, ephemeral: true });
  }
  if (interaction.customId === "claim") {
    if (isOwner) return interaction.reply({ content: "❌ Already owner.", ephemeral: true });
    if (!staff) return interaction.reply({ content: "❌ Staff only.", ephemeral: true });
    data.ownerId = interaction.user.id;
    tempVCs.set(vc.id, data);
    const textCh = interaction.guild.channels.cache.get(data.textId);
    if (textCh) {
      const msgs = await textCh.messages.fetch({ limit: 10 }).catch(() => null);
      const panelMsg = msgs?.find(m => m.author.id === client.user.id && m.components.length > 0);
      if (panelMsg) await panelMsg.edit(controlPanelPayload(data.ownerId, data.vcId));
    }
    return interaction.reply({ content: "👑 Claimed.", ephemeral: true });
  }
  if (interaction.customId === "pull_panel") {
    const textCh = interaction.guild.channels.cache.get(data.textId);
    if (textCh) {
      await textCh.send(controlPanelPayload(data.ownerId, data.vcId));
      return interaction.reply({ content: "📌 Pulled.", ephemeral: true });
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

  // PANEL
  if (msg.content === `${PREFIX}panel`) {
    const vc = member.voice?.channel;
    if (!vc) return msg.reply("❌ Join your temp VC.");
    const data = tempVCs.get(vc.id);
    if (!data) return;
    if (msg.author.id !== data.ownerId && !isStaff(member)) return msg.reply("❌ Only owner or staff.");
    msg.guild.channels.cache.get(data.textId)?.send(controlPanelPayload(data.ownerId, data.vcId));
  }

  // CLEAR OWNER
  if (msg.content === `${CLEAR_PREFIX}clearowner`) {
    if (!isStaff(member)) return msg.reply("❌ Staff only.");
    const since = Date.now() - 24 * 60 * 60 * 1000;
    let deleted = 0;
    for (const channel of msg.guild.channels.cache.values()) {
      if (!channel.isTextBased()) continue;
      let messages;
      try { messages = await channel.messages.fetch({ limit: 100 }); } catch { continue; }
      const targets = messages.filter(m => m.author.id === OWNER_USER_ID && m.createdTimestamp >= since);
      if (targets.size > 0) { await channel.bulkDelete(targets, true).catch(() => {}); deleted += targets.size; }
    }
    msg.reply(`🧹 Deleted **${deleted}** messages.`);
  }

  // DM ONE USER — supports @mention or user ID
  if (msg.content.startsWith(`${PREFIX}dmuser `)) {
    if (!isStaff(member)) return msg.reply("❌ Staff only.");

    // Get everything after "-dmuser "
    const fullArgs = msg.content.slice(`${PREFIX}dmuser `.length).trim();
    
    // Try to find a mention in the message
    const mentionMatch = msg.mentions.users.first();
    let targetUser = null;
    let messageContent = "";

    if (mentionMatch) {
      // User was @mentioned
      targetUser = mentionMatch;
      // Remove the mention from the message to get the actual message content
      // Mentions look like <@123456789> or <@!123456789>
      messageContent = fullArgs.replace(/<@!?(\d+)>/g, "").trim();
    } else {
      // No mention, try to parse user ID from start of message
      const idMatch = fullArgs.match(/^(\d{17,20})\s+(.+)$/s);
      if (!idMatch) return msg.reply("Usage: `-dmuser @username message` or `-dmuser 1234567890123456789 message`");
      
      const [, userId, msgText] = idMatch;
      try {
        targetUser = await client.users.fetch(userId);
        messageContent = msgText;
      } catch {
        return msg.reply("❌ User not found.");
      }
    }

    if (!messageContent) return msg.reply("❌ Message cannot be empty.");

    const result = await sendDMWithRetry(targetUser, messageContent);
    
    if (result.success) {
      msg.reply(`✅ DM sent to **${targetUser.tag}**`);
    } else if (result.closed) {
      msg.reply(`🔒 **${targetUser.tag}** has DMs closed.`);
    } else if (result.rateLimited) {
      msg.reply(`⏳ Rate limited. Try again in a minute.`);
    } else {
      msg.reply(`❌ Failed to DM **${targetUser.tag}**`);
    }
  }

  // DM ALL MEMBERS
  if (msg.content.startsWith(`${PREFIX}dm `)) {
    if (!isStaff(member)) return msg.reply("❌ Staff only.");

    const messageContent = msg.content.slice(`${PREFIX}dm `.length).trim();
    if (!messageContent) return msg.reply("Usage: `-dm <message>`");

    const statusMsg = await msg.reply(`🔍 Fetching members...`);

    try { await msg.guild.members.fetch(); } catch (e) { console.log("Fetch error:", e); }

    const targets = msg.guild.members.cache.map(m => m).filter(m => !m.bot);
    if (targets.length === 0) return statusMsg.edit("❌ No members found.");

    const estimatedTime = targets.length * (DM_DELAY_MS + 500 / DM_CONCURRENT);

    await statusMsg.edit(
      `🚀 **DMing ${targets.length} members**\n` +
      `⏱️ ETA: ~${formatTime(estimatedTime)} | Concurrent: ${DM_CONCURRENT} | Delay: ${DM_DELAY_MS}ms`
    );

    const jobId = `${msg.author.id}-${Date.now()}`;
    sendMassDMFast(member, targets, messageContent, statusMsg, jobId);
  }

  // DM VC MEMBERS
  if (msg.content.startsWith(`${PREFIX}dmhere `)) {
    if (!isStaff(member)) return msg.reply("❌ Staff only.");
    const messageContent = msg.content.slice(`${PREFIX}dmhere `.length).trim();
    if (!messageContent) return msg.reply("Usage: `-dmhere <message>`");
    const vc = member.voice?.channel;
    if (!vc) return msg.reply("❌ Join a VC first.");
    const targets = vc.members.map(m => m).filter(m => !m.bot);
    if (targets.length === 0) return msg.reply("❌ Empty VC.");
    const statusMsg = await msg.reply(`📨 DMing ${targets.length} members...`);
    const jobId = `${msg.author.id}-${Date.now()}`;
    sendMassDMFast(member, targets, messageContent, statusMsg, jobId);
  }

  // CANCEL
  if (msg.content === `${PREFIX}dmcancel`) {
    if (!isStaff(member)) return msg.reply("❌ Staff only.");
    let cancelled = 0;
    for (const [jobId, job] of activeDMJobs) {
      if (jobId.startsWith(msg.author.id)) { job.active = false; cancelled++; }
    }
    msg.reply(cancelled > 0 ? `🛑 Cancelled **${cancelled}** job(s).` : "❌ No active jobs.");
  }
});

// ----------------------
// LOGIN
// ----------------------
client.login(process.env.TOKEN);
