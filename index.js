// =====================================
// WOCKHARDT — TEMP VC SYSTEM (WORKING)
// Join-to-Create • Auto Panel Text • Buttons
// Owner + Staff can Pull Panel
// Prefix: -
// discord.js v14
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

// -------------------- CONFIG --------------------
const PREFIX = "-";

// REQUIRED (set in .env ideally)
const CREATE_VC_ID = process.env.CREATE_VC_ID || "1451498864350859264"; // join-to-create VOICE channel
const CATEGORY_ID = process.env.CATEGORY_ID || "1411585822708469861";   // category where temp vc + temp text go

// Name template
const TEMP_NAME = process.env.TEMP_NAME || "💜・{username}";

// Optional staff roles (comma separated role IDs). Staff also can use panel.
const MOD_ROLE_IDS = (process.env.MOD_ROLE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// -------------------- CLIENT --------------------
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

// Track temp VCs: vcId -> { ownerId, vcId, textId }
const tempVCs = new Map();

// -------------------- STAFF CHECK --------------------
function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  if (MOD_ROLE_IDS.length && MOD_ROLE_IDS.some((id) => member.roles.cache.has(id))) return true;
  return false;
}

// -------------------- PANEL MESSAGE --------------------
function controlPanelPayload(ownerId, vcId) {
  return {
    content:
      `💜 **Temp VC Panel**\n` +
      `Owner: <@${ownerId}>\n` +
      `VC: <#${vcId}>\n\n` +
      `Use buttons below. Owner + Staff can use.`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("lock").setLabel("🔒 Lock").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("unlock").setLabel("🔓 Unlock").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("limit").setLabel("👥 Limit").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("rename").setLabel("✏️ Rename").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("claim").setLabel("👑 Claim").setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("pullpanel").setLabel("📌 Pull Panel").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("closevc").setLabel("🧨 Close VC").setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

// -------------------- HELPERS --------------------
async function fetchMeSafe(guild) {
  return guild.members.me ?? (await guild.members.fetchMe());
}

function getMemberTempVC(member) {
  const vc = member?.voice?.channel;
  if (!vc) return null;
  if (!tempVCs.has(vc.id)) return null;
  return vc;
}

async function sendPanelToText(guild, vcId) {
  const data = tempVCs.get(vcId);
  if (!data) return null;

  const txt = guild.channels.cache.get(data.textId);
  if (!txt || !txt.isTextBased()) return null;

  return txt.send(controlPanelPayload(data.ownerId, data.vcId));
}

// -------------------- READY --------------------
client.once("ready", () => {
  console.log(`💜 ${client.user.tag} is online`);
});

// -------------------- CREATE / DELETE TEMP VCS --------------------
client.on("voiceStateUpdate", async (oldState, newState) => {
  // CREATE when user joins join-to-create VC
  if (newState.channelId === CREATE_VC_ID) {
    const guild = newState.guild;
    const member = newState.member;

    try {
      const me = await fetchMeSafe(guild);
      const baseName = TEMP_NAME.replace("{username}", member.user.username).slice(0, 90);

      // Create temp voice channel
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
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers],
          },
        ],
      });

      // Create temp text panel channel
      const newText = await guild.channels.create({
        name: `${baseName}-panel`.slice(0, 90),
        type: ChannelType.GuildText,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
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
        ],
      });

      // Save
      tempVCs.set(newVC.id, { ownerId: member.id, vcId: newVC.id, textId: newText.id });

      // Move member into their temp VC
      await member.voice.setChannel(newVC).catch(() => {});

      // Send panel
      await newText.send(controlPanelPayload(member.id, newVC.id));
    } catch (e) {
      console.log("❌ Temp VC create failed:", e); // shows real reason
    }
  }

  // DELETE when a temp VC becomes empty
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

// -------------------- COMMAND: -panel (Pull Panel) --------------------
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild) return;
  if (!msg.content.startsWith(PREFIX)) return;

  const cmd = msg.content.slice(PREFIX.length).trim().toLowerCase();
  if (cmd !== "panel") return;

  const member = await msg.guild.members.fetch(msg.author.id).catch(() => null);
  if (!member) return;

  const vc = getMemberTempVC(member);
  if (!vc) return msg.reply("❌ You must be in your temp VC to pull the panel.");

  const data = tempVCs.get(vc.id);
  const ownerOrStaff = member.id === data.ownerId || isStaff(member);
  if (!ownerOrStaff) return msg.reply("❌ Only the VC owner or staff can pull the panel.");

  const sent = await sendPanelToText(msg.guild, vc.id);
  if (!sent) return msg.reply("⚠️ Panel channel not found.");

  return msg.reply("✅ Panel pulled.").catch(() => {});
});

// -------------------- BUTTONS --------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.guild) return;

  const member = interaction.guild.members.cache.get(interaction.user.id);
  if (!member) return;

  const vc = getMemberTempVC(member);
  if (!vc) return interaction.reply({ content: "❌ You must be in your temp VC.", ephemeral: true });

  const data = tempVCs.get(vc.id);
  if (!data) return interaction.reply({ content: "❌ This is not a temp VC.", ephemeral: true });

  const ownerOrStaff = interaction.user.id === data.ownerId || isStaff(member);
  if (!ownerOrStaff) {
    return interaction.reply({ content: "❌ Only the VC owner or staff can use these controls.", ephemeral: true });
  }

  // LOCK
  if (interaction.customId === "lock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: false }).catch(() => {});
    return interaction.reply({ content: "🔒 VC locked.", ephemeral: true });
  }

  // UNLOCK
  if (interaction.customId === "unlock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: true }).catch(() => {});
    return interaction.reply({ content: "🔓 VC unlocked.", ephemeral: true });
  }

  // LIMIT
  if (interaction.customId === "limit") {
    await interaction.reply({ content: "Send the new user limit (number).", ephemeral: true });

    const panelChannel = interaction.channel;
    const filter = (m) => m.author.id === interaction.user.id;
    const collected = await panelChannel.awaitMessages({ filter, max: 1, time: 15000 }).catch(() => null);

    if (!collected || !collected.size) return;
    const num = parseInt(collected.first().content, 10);
    if (isNaN(num)) return collected.first().reply("❌ Invalid number.");

    await vc.setUserLimit(Math.max(0, Math.min(num, 99))).catch(() => {});
    return collected.first().reply(`👥 Limit set to **${num}**.`);
  }

  // RENAME
  if (interaction.customId === "rename") {
    await interaction.reply({ content: "Send the new channel name.", ephemeral: true });

    const panelChannel = interaction.channel;
    const filter = (m) => m.author.id === interaction.user.id;
    const collected = await panelChannel.awaitMessages({ filter, max: 1, time: 15000 }).catch(() => null);

    if (!collected || !collected.size) return;
    const newName = collected.first().content.slice(0, 90);

    await vc.setName(newName).catch(() => {});
    return collected.first().reply(`✏️ Renamed to **${newName}**.`);
  }

  // CLAIM
  if (interaction.customId === "claim") {
    data.ownerId = interaction.user.id;
    tempVCs.set(vc.id, data);
    return interaction.reply({ content: "👑 You now own this VC.", ephemeral: true });
  }

  // PULL PANEL
  if (interaction.customId === "pullpanel") {
    const sent = await sendPanelToText(interaction.guild, vc.id);
    if (!sent) return interaction.reply({ content: "⚠️ Panel channel not found.", ephemeral: true });
    return interaction.reply({ content: "✅ Panel pulled.", ephemeral: true });
  }

  // CLOSE VC (deletes VC + panel text)
  if (interaction.customId === "closevc") {
    const txt = interaction.guild.channels.cache.get(data.textId);
    tempVCs.delete(vc.id);

    await interaction.reply({ content: "🧨 Closing VC...", ephemeral: true }).catch(() => {});
    vc.delete().catch(() => {});
    if (txt) txt.delete().catch(() => {});
    return;
  }
});

// -------------------- LOGIN --------------------
client.login(process.env.TOKEN);
