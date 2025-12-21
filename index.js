// =====================================
// WOCKHARDT — ADVANCED TEMP VC SYSTEM
// LOCK • UNLOCK • LIMIT • RENAME • CLAIM
// + PANEL PULL (-panel) OWNER OR STAFF
// + STAFF CAN USE BUTTONS TOO
// + CLEAN CLAIM TRANSFER (RECOMMENDED)
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
  PermissionsBitField,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

/* ---------- CONFIG ---------- */
const PREFIX = "-";

// join-to-create VOICE channel
const CREATE_VC_ID = process.env.CREATE_VC_ID || "1451498864350859264";
// temp VC category
const CATEGORY_ID = process.env.CATEGORY_ID || "1411585822708469861";

// temp names
const TEMP_NAME = process.env.TEMP_NAME || "💜・{username}";

// optional staff role ids (comma separated)
const MOD_ROLE_IDS = (process.env.MOD_ROLE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Track temporary VCs + their text panels
// key = vcId -> { owner, vcId, textId }
const tempVCs = new Map();

/* ---------- STAFF CHECK ---------- */
function isStaffMember(member) {
  if (!member) return false;

  // admin
  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;

  // common mod perms
  if (
    member.permissions?.has(PermissionsBitField.Flags.ManageGuild) ||
    member.permissions?.has(PermissionsBitField.Flags.ManageChannels) ||
    member.permissions?.has(PermissionsBitField.Flags.ManageMessages) ||
    member.permissions?.has(PermissionsBitField.Flags.ModerateMembers)
  ) {
    return true;
  }

  // optional mod roles list
  if (MOD_ROLE_IDS.length && MOD_ROLE_IDS.some((id) => member.roles.cache.has(id))) return true;

  return false;
}

/* ---------- READY ---------- */
client.once("ready", () => {
  console.log(`💜 ${client.user.tag} is online`);
});

/* ---------- CONTROL PANEL MESSAGE ---------- */
function controlPanelMessage(member, vc) {
  return {
    content: `💜 **Temp VC created for <@${member.id}>**\n🔊 ${vc}`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("lock").setLabel("🔒 Lock").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("unlock").setLabel("🔓 Unlock").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("limit").setLabel("👥 Limit").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("rename").setLabel("✏️ Rename").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("claim").setLabel("👑 Claim").setStyle(ButtonStyle.Success)
      ),
    ],
  };
}

/* ---------- HELPERS ---------- */
function getTempDataFromMember(member) {
  const vc = member?.voice?.channel;
  if (!vc) return { vc: null, data: null };
  const data = tempVCs.get(vc.id) || null;
  return { vc, data };
}

function canUseControls(member, data) {
  if (!member || !data) return false;
  if (member.id === data.owner) return true;
  if (isStaffMember(member)) return true;
  return false;
}

/* ---------- CREATE TEMP VC + TEXT + PANEL ---------- */
client.on("voiceStateUpdate", async (oldState, newState) => {
  // CREATE when user joins the create VC channel
  if (newState.channelId === CREATE_VC_ID) {
    const guild = newState.guild;
    const member = newState.member;

    try {
      const baseName = TEMP_NAME.replace("{username}", member.user.username).slice(0, 80);

      // Create the temp voice channel
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
            ],
          },
        ],
      });

      // Create the private text channel for controls/chat (owner-only + bot)
      const newText = await guild.channels.create({
        name: `${baseName}-chat`.slice(0, 100),
        type: ChannelType.GuildText,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          // lock everyone out
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          // allow owner
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
          // allow bot
          {
            id: guild.members.me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageMessages,
            ],
          },
        ],
      });

      // Move user into the VC
      await member.voice.setChannel(newVC).catch(() => {});

      // Save ownership
      tempVCs.set(newVC.id, { owner: member.id, vcId: newVC.id, textId: newText.id });

      // Send control panel inside the temp text channel
      await newText.send(controlPanelMessage(member, newVC));
    } catch (e) {
      console.log("❌ Temp VC create failed:", e?.message);
    }
  }

  // DELETE when empty
  if (oldState.channelId && tempVCs.has(oldState.channelId)) {
    const data = tempVCs.get(oldState.channelId);
    const guild = oldState.guild;

    const vc = guild.channels.cache.get(data.vcId);
    const txt = guild.channels.cache.get(data.textId);

    if (vc && vc.members.size === 0) {
      tempVCs.delete(vc.id);
      vc.delete().catch(() => {});
      if (txt) txt.delete().catch(() => {});
    }
  }
});

/* ---------- PULL PANEL COMMAND (-panel) OWNER OR STAFF ---------- */
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild) return;
  if (!msg.content.startsWith(PREFIX)) return;

  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = (args.shift() || "").toLowerCase();

  if (cmd !== "panel") return;

  const member = msg.member;
  const { vc, data } = getTempDataFromMember(member);

  if (!vc) return msg.reply("❌ Join your temp VC first.").catch(() => {});
  if (!data) return msg.reply("❌ This is not a temp VC.").catch(() => {});

  if (!canUseControls(member, data)) {
    return msg.reply("❌ Only the VC owner or staff can pull the panel.").catch(() => {});
  }

  // If they run it anywhere, send it into the VC's temp text channel if it exists
  const panelChannel = msg.guild.channels.cache.get(data.textId);
  if (!panelChannel || panelChannel.type !== ChannelType.GuildText) {
    return msg.reply("❌ Panel channel missing.").catch(() => {});
  }

  await panelChannel.send(controlPanelMessage(member, vc)).catch(() => {});
  return msg.reply("✅ Panel pulled.").catch(() => {});
});

/* ---------- BUTTON INTERACTIONS (OWNER OR STAFF) ---------- */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const member = interaction.guild.members.cache.get(interaction.user.id);
  const { vc, data } = getTempDataFromMember(member);

  if (!vc) return interaction.reply({ content: "❌ Join your temp VC first.", ephemeral: true });
  if (!data) return interaction.reply({ content: "❌ This is not a temp VC.", ephemeral: true });

  // OWNER OR STAFF
  if (!canUseControls(member, data)) {
    return interaction.reply({ content: "❌ Only the VC owner or staff can use these controls.", ephemeral: true });
  }

  // --- LOCK VC ---
  if (interaction.customId === "lock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: false }).catch(() => {});
    return interaction.reply({ content: "🔒 The VC has been locked.", ephemeral: true });
  }

  // --- UNLOCK VC ---
  if (interaction.customId === "unlock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: true }).catch(() => {});
    return interaction.reply({ content: "🔓 The VC has been unlocked.", ephemeral: true });
  }

  // --- SET LIMIT ---
  if (interaction.customId === "limit") {
    await interaction.reply({ content: "Send the new user limit (number).", ephemeral: true });

    const filter = (m) => m.author.id === interaction.user.id;
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 15000 }).catch(() => null);
    if (!collected || !collected.size) return;

    const num = parseInt(collected.first().content, 10);
    if (isNaN(num)) return collected.first().reply("❌ Invalid number.").catch(() => {});

    await vc.setUserLimit(num).catch(() => {});
    return collected.first().reply(`👥 Limit set to **${num}**.`).catch(() => {});
  }

  // --- RENAME ---
  if (interaction.customId === "rename") {
    await interaction.reply({ content: "Send the new channel name.", ephemeral: true });

    const filter = (m) => m.author.id === interaction.user.id;
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 15000 }).catch(() => null);
    if (!collected || !collected.size) return;

    const newName = collected.first().content.slice(0, 80);
    await vc.setName(newName).catch(() => {});
    return collected.first().reply(`✏️ Renamed to **${newName}**.`).catch(() => {});
  }

  // --- CLAIM OWNERSHIP (CLEAN TRANSFER) ---
  if (interaction.customId === "claim") {
    const guild = interaction.guild;

    const oldOwnerId = data.owner;
    const newOwnerId = interaction.user.id;

    const oldOwner = await guild.members.fetch(oldOwnerId).catch(() => null);
    const newOwner = await guild.members.fetch(newOwnerId).catch(() => null);

    const txt = guild.channels.cache.get(data.textId);

    if (!vc || !txt || !newOwner) {
      return interaction.reply({ content: "❌ VC data missing.", ephemeral: true });
    }

    // Update ownership
    data.owner = newOwnerId;
    tempVCs.set(vc.id, data);

    // Remove old owner perms
    if (oldOwner) {
      await vc.permissionOverwrites.edit(oldOwner.id, {
        ManageChannels: false,
        Connect: true,
      }).catch(() => {});
      await txt.permissionOverwrites.delete(oldOwner.id).catch(() => {});
    }

    // Give new owner perms
    await vc.permissionOverwrites.edit(newOwnerId, {
      ViewChannel: true,
      Connect: true,
      ManageChannels: true,
    }).catch(() => {});
    await txt.permissionOverwrites.edit(newOwnerId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      EmbedLinks: true,
      AttachFiles: true,
    }).catch(() => {});

    return interaction.reply({
      content: `👑 **Ownership transferred to <@${newOwnerId}>**`,
      ephemeral: true,
    });
  }
});

/* ---------- LOGIN ---------- */
client.login(process.env.TOKEN);
