// =====================================
// WOCKHARDT — ADVANCED TEMP VC SYSTEM v2 (WORKING)
// JOIN-TO-CREATE + PRIVATE PANEL TEXT
// Buttons: LOCK • UNLOCK • LIMIT • RENAME • CLAIM
// Extra: PULL PANEL (command + button)
// Staff can also use controls
// NEW: -dm <roleid> <message> | -dmhere <message> (BULK DM SUPPORT)
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

// DM config for bulk sending
const DM_DELAY_MS = parseInt(process.env.DM_DELAY_MS) || 5000; // 5 seconds default between DMs
const DM_BATCH_SIZE = parseInt(process.env.DM_BATCH_SIZE) || 50; // progress update every 50 DMs

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

// Track active DM jobs to prevent overlap
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
// DM HELPER (BULK SUPPORT)
// ----------------------
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

async function sendMassDM(member, targets, messageContent, replyMsg, jobId) {
  let success = 0;
  let failed = 0;
  let dmsClosed = 0;
  const total = targets.length;
  const startTime = Date.now();

  activeDMJobs.set(jobId, { total, success, failed, dmsClosed, active: true });

  for (let i = 0; i < targets.length; i++) {
    // Check if job was cancelled
    if (!activeDMJobs.get(jobId)?.active) {
      await replyMsg.edit(`🛑 DM job cancelled by user.\nProgress: **${success}** sent, **${dmsClosed}** closed, **${failed}** failed.`);
      activeDMJobs.delete(jobId);
      return;
    }

    const target = targets[i];
    if (target.bot) continue;

    try {
      await target.send(messageContent);
      success++;
    } catch (err) {
      if (err.code === 50007) {
        dmsClosed++;
      } else if (err.code === 429) {
        // Rate limited - wait longer
        const retryAfter = err.retry_after || 60;
        await replyMsg.edit(`⏳ Rate limited! Waiting **${retryAfter}** seconds...\nProgress: **${success}/${total}** sent`);
        await sleep(retryAfter * 1000);
        i--; // retry this user
        continue;
      } else {
        failed++;
      }
    }

    // Update progress every batch
    if ((i + 1) % DM_BATCH_SIZE === 0 || i === targets.length - 1) {
      const elapsed = Date.now() - startTime;
      const avgTimePerDM = elapsed / (i + 1);
      const remaining = total - (i + 1);
      const eta = avgTimePerDM * remaining;

      const progressBar = "█".repeat(Math.floor((i + 1) / total * 10)) + "░".repeat(10 - Math.floor((i + 1) / total * 10));

      await replyMsg.edit(
        `📨 **Bulk DM Progress** [${progressBar}]\n` +
        `**${i + 1}/${total}** processed | ✅ ${success} | 🔒 ${dmsClosed} | ❌ ${failed}\n` +
        `⏱️ Elapsed: ${formatTime(elapsed)} | ETA: ${formatTime(eta)}`
      );
    }

    await sleep(DM_DELAY_MS);
  }

  activeDMJobs.delete(jobId);

  const elapsed = Date.now() - startTime;
  await replyMsg.edit(
    `✅ **Bulk DM Complete!**\n` +
    `📊 Total: **${total}** | ✅ Sent: **${success}** | 🔒 DMs Closed: **${dmsClosed}** | ❌ Failed: **${failed}**\n` +
    `⏱️ Total time: ${formatTime(elapsed)}`
  );
}

// ----------------------
// READY
// ----------------------
client.once("ready", async () => {
  console.log(`💜 ${client.user.tag} is online`);
  console.log(`📨 DM delay: ${DM_DELAY_MS}ms | Batch size: ${DM_BATCH_SIZE}`);
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
// INTERACTIONS (buttons)
// ----------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  const customId = interaction.customId;
  const vc = member.voice?.channel;
  if (!vc) return interaction.reply({ content: "❌ Join your temp VC first.", ephemeral: true });

  const data = tempVCs.get(vc.id);
  if (!data) return interaction.reply({ content: "❌ Not a temp VC.", ephemeral: true });

  const isOwner = interaction.user.id === data.ownerId;
  const staff = isStaff(member);

  if (!isOwner && !staff)
    return interaction.reply({ content: "❌ Only owner or staff.", ephemeral: true });

  // LOCK
  if (customId === "lock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
    return interaction.reply({ content: "🔒 VC locked.", ephemeral: true });
  }

  // UNLOCK
  if (customId === "unlock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: true });
    return interaction.reply({ content: "🔓 VC unlocked.", ephemeral: true });
  }

  // LIMIT
  if (customId === "limit") {
    await interaction.reply({ content: "Reply with the user limit (1-99, or 0 for unlimited).", ephemeral: true });
    const filter = (m) => m.author.id === interaction.user.id;
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ["time"] }).catch(() => null);
    if (!collected) return;
    const limit = parseInt(collected.first().content);
    if (isNaN(limit) || limit < 0 || limit > 99) return interaction.followUp({ content: "❌ Invalid number.", ephemeral: true });
    await vc.setUserLimit(limit);
    return interaction.followUp({ content: `👥 User limit set to ${limit || "unlimited"}.`, ephemeral: true });
  }

  // RENAME
  if (customId === "rename") {
    await interaction.reply({ content: "Reply with the new VC name.", ephemeral: true });
    const filter = (m) => m.author.id === interaction.user.id;
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ["time"] }).catch(() => null);
    if (!collected) return;
    const newName = safeName(collected.first().content, 90);
    await vc.setName(newName);
    return interaction.followUp({ content: `✏️ Renamed to **${newName}**.`, ephemeral: true });
  }

  // CLAIM
  if (customId === "claim") {
    if (isOwner) return interaction.reply({ content: "❌ You already own this VC.", ephemeral: true });
    if (!staff) return interaction.reply({ content: "❌ Only staff can claim.", ephemeral: true });
    data.ownerId = interaction.user.id;
    tempVCs.set(vc.id, data);
    const textCh = interaction.guild.channels.cache.get(data.textId);
    if (textCh) {
      const msgs = await textCh.messages.fetch({ limit: 10 }).catch(() => null);
      if (msgs) {
        const panelMsg = msgs.find((m) => m.author.id === client.user.id && m.components.length > 0);
        if (panelMsg) await panelMsg.edit(controlPanelPayload(data.ownerId, data.vcId));
      }
    }
    return interaction.reply({ content: "👑 VC claimed.", ephemeral: true });
  }

  // PULL PANEL
  if (customId === "pull_panel") {
    const textCh = interaction.guild.channels.cache.get(data.textId);
    if (textCh) {
      await textCh.send(controlPanelPayload(data.ownerId, data.vcId));
      return interaction.reply({ content: "📌 Panel pulled.", ephemeral: true });
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
        (m) =>
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

  // -------- DM ROLE (STAFF ONLY - BULK)
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

    const targets = role.members.map((m) => m).filter((m) => !m.bot);
    if (targets.length === 0)
      return msg.reply("❌ No members in that role.");

    const estimatedTime = targets.length * DM_DELAY_MS;
    const confirmMsg = await msg.reply(
      `⚠️ **Bulk DM Warning**\n` +
      `📊 Targets: **${targets.length}** members with role **${role.name}**\n` +
      `⏱️ Estimated time: **${formatTime(estimatedTime)}**\n` +
      `🐌 Delay between DMs: **${DM_DELAY_MS / 1000}s**\n\n` +
      `Reply with **yes** to start, or **cancel** to abort.`
    );

    const filter = (m) => m.author.id === msg.author.id && ["yes", "cancel"].includes(m.content.toLowerCase());
    const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ["time"] }).catch(() => null);

    if (!collected || collected.first().content.toLowerCase() !== "yes") {
      return confirmMsg.edit("🛑 DM job cancelled.");
    }

    const jobId = `${msg.author.id}-${Date.now()}`;
    const statusMsg = await msg.reply(`🚀 Starting bulk DM to **${targets.length}** members...`);

    await sendMassDM(member, targets, messageContent, statusMsg, jobId);
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

    const targets = vc.members.map((m) => m).filter((m) => !m.bot);
    if (targets.length === 0)
      return msg.reply("❌ No one in this VC.");

    const statusMsg = await msg.reply(`📨 Sending to **${targets.length}** members in **${vc.name}**...`);

    const jobId = `${msg.author.id}-${Date.now()}`;
    await sendMassDM(member, targets, messageContent, statusMsg, jobId);
  }

  // -------- CANCEL DM JOB
  if (msg.content === `${PREFIX}dmcancel`) {
    if (!isStaff(member))
      return msg.reply("❌ Staff only.");

    let cancelled = 0;
    for (const [jobId, job] of activeDMJobs) {
      if (jobId.startsWith(msg.author.id)) {
        job.active = false;
        cancelled++;
      }
    }

    if (cancelled > 0) {
      msg.reply(`🛑 Cancelled **${cancelled}** active DM job(s).`);
    } else {
      msg.reply("❌ No active DM jobs to cancel.");
    }
  }
});

// ----------------------
// LOGIN
// ----------------------
client.login(process.env.TOKEN);
