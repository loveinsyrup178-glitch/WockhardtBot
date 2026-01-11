// =====================================
// WOCKHARDT — ADVANCED TEMP VC SYSTEM v2 (WORKING)
// JOIN-TO-CREATE + PRIVATE PANEL TEXT
// Buttons: LOCK • UNLOCK • LIMIT • RENAME • CLAIM
// Extra: PULL PANEL (command + button)
// Staff can also use controls
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
// READY
// ----------------------
client.once("ready", async () => {
  console.log(`💜 ${client.user.tag} is online`);
  console.log(`CREATE_VC_ID=${CREATE_VC_ID}`);
  console.log(`CATEGORY_ID=${CATEGORY_ID}`);
});

// ----------------------
// CREATE TEMP VC + PANEL TEXT
// ----------------------
client.on("voiceStateUpdate", async (oldState, newState) => {
  // Create when user joins join-to-create channel
  if (newState.channelId === CREATE_VC_ID) {
    const guild = newState.guild;
    const member = newState.member;
    if (!guild || !member) return;

    try {
      // Hard check: category exists + is category
      const cat = guild.channels.cache.get(CATEGORY_ID);
      if (!cat || cat.type !== ChannelType.GuildCategory) {
        console.log("❌ CATEGORY_ID invalid or not a category:", CATEGORY_ID);
        return;
      }

      // Ensure we have bot member (fixes many “doesn’t create” cases)
      const me = await guild.members.fetchMe();

      const baseName = safeName(TEMP_NAME.replace("{username}", member.user.username), 90);

      // Create temp voice
      const newVC = await guild.channels.create({
        name: baseName,
        type: ChannelType.GuildVoice,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
          },
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers,
            ],
          },
          {
            id: me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.Connect,
            ],
          },
        ],
      });

      // Create temp text panel
      const newText = await guild.channels.create({
        name: safeName(`${baseName}-panel`, 90),
        type: ChannelType.GuildText,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },

          // Owner
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
            ],
          },

          // Bot
          {
            id: me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageMessages,
            ],
          },

          // Optional staff roles
          ...STAFF_ROLE_IDS.map((rid) => ({
            id: rid,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          })),
        ],
      });

      // Move user into temp VC
      await member.voice.setChannel(newVC).catch(() => {});

      // Save record
      tempVCs.set(newVC.id, { ownerId: member.id, vcId: newVC.id, textId: newText.id, panelMsgId: null });

      // Send panel
      const panelMsg = await newText.send(controlPanelPayload(member.id, newVC.id));
      tempVCs.set(newVC.id, { ownerId: member.id, vcId: newVC.id, textId: newText.id, panelMsgId: panelMsg.id });

      console.log(`✅ Created temp VC ${newVC.id} + panel ${newText.id} for ${member.user.tag}`);
    } catch (e) {
      console.log("❌ Temp VC create failed FULL ERROR:", e);
    }
  }

  // Delete when empty
  if (oldState.channelId && tempVCs.has(oldState.channelId)) {
    const data = tempVCs.get(oldState.channelId);
    const guild = oldState.guild;

    const vc = guild.channels.cache.get(data.vcId);
    const txt = guild.channels.cache.get(data.textId);

    if (vc && vc.members.size === 0) {
      tempVCs.delete(vc.id);

      vc.delete().catch(() => {});
      if (txt) txt.delete().catch(() => {});
      console.log(`🧹 Deleted temp VC ${data.vcId} + panel ${data.textId}`);
    }
  }
});

// ----------------------
// COMMANDS
// ----------------------
client.on("messageCreate", async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  // ----- PANEL COMMAND (-panel)
  if (msg.content.startsWith(PREFIX)) {
    const [cmdRaw] = msg.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = (cmdRaw || "").toLowerCase();

    if (cmd === "panel") {
      const member = await msg.guild.members.fetch(msg.author.id).catch(() => null);
      if (!member) return;

      const vc = member.voice?.channel || null;

      if (!vc) {
        if (!isStaff(member)) {
          return msg.reply("❌ Join your temp VC first to pull the panel.").catch(() => {});
        }
        const found = [...tempVCs.values()].find((d) => d.textId === msg.channel.id);
        if (!found) return msg.reply("❌ Run this inside a temp panel channel or while in a temp VC.").catch(() => {});
        const panel = await msg.channel.send(controlPanelPayload(found.ownerId, found.vcId)).catch(() => null);
        if (panel) tempVCs.set(found.vcId, { ...found, panelMsgId: panel.id });
        return;
      }

      const data = tempVCs.get(vc.id);
      if (!data) return msg.reply("❌ This VC is not a temp VC.").catch(() => {});

      if (msg.author.id !== data.ownerId && !isStaff(member)) {
        return msg.reply("❌ Only the VC owner or staff can pull the panel.").catch(() => {});
      }

      const panelChannel = msg.guild.channels.cache.get(data.textId);
      if (!panelChannel || !panelChannel.isTextBased()) {
        return msg.reply("❌ Panel channel missing.").catch(() => {});
      }

      const panelMsg = await panelChannel.send(controlPanelPayload(data.ownerId, data.vcId)).catch(() => null);
      if (panelMsg) tempVCs.set(vc.id, { ...data, panelMsgId: panelMsg.id });

      return msg.reply("📌 Panel pulled.").catch(() => {});
    }
  }

  // ----- CLEAR OWNER MESSAGES (#clearowner)
  if (msg.content.startsWith("#")) {
    const [cmdRaw] = msg.content.slice(1).trim().split(/\s+/);
    const cmd = (cmdRaw || "").toLowerCase();

    if (cmd === "clearowner") {
      const member = await msg.guild.members.fetch(msg.author.id).catch(() => null);
      if (!member || !isStaff(member)) {
        return msg.reply("❌ You do not have permission to run this.").catch(() => {});
      }

      try {
        const ownerId = "1277264433823088692"; // provided user ID
        const since = Date.now() - 24 * 60 * 60 * 1000;

        let totalDeleted = 0;
        for (const channel of msg.guild.channels.cache.values()) {
          if (!channel.isTextBased()) continue;

          let fetched;
          try {
            fetched = await channel.messages.fetch({ limit: 100 });
          } catch {
            continue;
          }

          const toDelete = fetched.filter(
            (m) => m.author.id === ownerId && m.createdTimestamp >= since
          );

          if (toDelete.size > 0) {
            await channel.bulkDelete(toDelete, true).catch(() => {});
            totalDeleted += toDelete.size;
          }
        }

        msg.reply(`🧹 Deleted ${totalDeleted} messages from the server owner in the last 24 hours.`).catch(() => {});
      } catch (e) {
        console.log("❌ #clearowner failed:", e);
        msg.reply("❌ Failed to delete messages.").catch(() => {});
      }
    }
  }
});

// ----------------------
// BUTTON CONTROLS (OWNER OR STAFF)
// ----------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  let data =
    [...tempVCs.values()].find((d) => d.textId === interaction.channelId) ||
    null;

  if (!data) {
    const vc = member.voice?.channel;
    if (vc) data = tempVCs.get(vc.id) || null;
  }

  if (!data) {
    return interaction.reply({ content: "❌ This is not linked to a temp VC.", ephemeral: true });
  }

  const vc = interaction.guild.channels.cache.get(data.vcId);
  if (!vc) return interaction.reply({ content: "❌ Temp VC not found.", ephemeral: true });

  const isOwner = interaction.user.id === data.ownerId;
  const staff = isStaff(member);

  if (!isOwner && !staff) {
    return interaction.reply({ content: "❌ Only the VC owner or staff can use these controls.", ephemeral: true });
  }

  // ---- Pull Panel
  if (interaction.customId === "pull_panel") {
    const panelChannel = interaction.guild.channels.cache.get(data.textId);
    if (!panelChannel || !panelChannel.isTextBased()) {
      return interaction.reply({ content: "❌ Panel channel missing.", ephemeral: true });
    }
    const panelMsg = await panelChannel.send(controlPanelPayload(data.ownerId, data.vcId)).catch(() => null);
    if (panelMsg) tempVCs.set(data.vcId, { ...data, panelMsgId: panelMsg.id });
    return interaction.reply({ content: "📌 Panel pulled.", ephemeral: true });
  }

  // ---- Lock
  if (interaction.customId === "lock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: false }).catch(() => {});
    return interaction.reply({ content: "🔒 VC locked.", ephemeral: true });
  }

  // ---- Unlock
  if (interaction.customId === "unlock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: true }).catch(() => {});
    return interaction.reply({ content: "🔓 VC unlocked.", ephemeral: true });
  }

  // ---- Limit
  if (interaction.customId === "limit") {
    await interaction.reply({ content: "Send the new user limit (number).", ephemeral: true });

    const filter = (m) => m.author.id === interaction.user.id;
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 15000 }).catch(() => null);
    if (!collected || !collected.size) return;

    const num = parseInt(collected.first().content, 10);
    if (isNaN(num) || num < 0 || num > 99) return collected.first().reply("❌ Invalid number (0-99).").catch(() => {});

    await vc.setUserLimit(num).catch(() => {});
    return collected.first().reply(`👥 Limit set to **${num}**.`).catch(() => {});
  }

  // ---- Rename
  if (interaction.customId === "rename") {
    await interaction.reply({ content: "Send the new channel name.", ephemeral: true });

    const filter = (m) => m.author.id === interaction.user.id;
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 15000 }).catch(() => null);
    if (!collected || !collected.size) return;

    const newName = safeName(collected.first().content, 90);
    await vc.setName(newName).catch(() => {});
    return collected.first().reply(`✏️ Renamed to **${newName}**.`).catch(() => {});
  }

  // ---- Claim (owner swap)
  if (interaction.customId === "claim") {
    tempVCs.set(vc.id, { ...data, ownerId: interaction.user.id });
    return interaction.reply({ content: "👑 You now own this VC.", ephemeral: true });
  }
});

// ----------------------
// LOGIN
// ----------------------
client.login(process.env.TOKEN);
