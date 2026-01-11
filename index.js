// =====================================
// WOCKHARDT — ADVANCED TEMP VC SYSTEM v2
// Railway SAFE • NO SLASH REGISTRATION
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
const OWNER_TARGET_ID = "1277264433823088692";

const CREATE_VC_ID = process.env.CREATE_VC_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;

const STAFF_ROLE_IDS = (process.env.STAFF_ROLE_IDS || "")
  .split(",")
  .map(r => r.trim())
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

// ----------------------
// TEMP VC STORE
// ----------------------
const tempVCs = new Map();

// ----------------------
// HELPERS
// ----------------------
function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (STAFF_ROLE_IDS.some(id => member.roles.cache.has(id))) return true;
  return false;
}

function safeName(str, max = 90) {
  return (str || "temp").replace(/[\n\r\t]/g, " ").slice(0, max);
}

// ----------------------
// PANEL
// ----------------------
function panelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lock").setLabel("🔒 Lock").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("unlock").setLabel("🔓 Unlock").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("limit").setLabel("👥 Limit").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("rename").setLabel("✏️ Rename").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("claim").setLabel("👑 Claim").setStyle(ButtonStyle.Success)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("pull_panel").setLabel("📌 Pull Panel").setStyle(ButtonStyle.Secondary)
    )
  ];
}

function panelPayload(ownerId, vcId) {
  return {
    content:
      `💜 **Temp VC created for <@${ownerId}>**\n` +
      `🔊 <#${vcId}>\n\n` +
      `Use buttons below to control your VC.\n` +
      `📌 Use **-panel** to pull again.`,
    components: panelRows(),
  };
}

// ----------------------
// READY
// ----------------------
client.once("ready", () => {
  console.log(`💜 ${client.user.tag} ONLINE`);
  console.log("✅ Railway stable build running");
});

// ----------------------
// TEMP VC CREATE / DELETE
// ----------------------
client.on("voiceStateUpdate", async (oldState, newState) => {
  if (newState.channelId === CREATE_VC_ID) {
    const guild = newState.guild;
    const member = newState.member;
    if (!guild || !member) return;

    const me = await guild.members.fetchMe();
    const name = safeName(`💜・${member.user.username}`);

    const vc = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: CATEGORY_ID,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        { id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
        { id: me.id, allow: [PermissionFlagsBits.ManageChannels] },
      ],
    });

    const text = await guild.channels.create({
      name: `${name}-panel`,
      type: ChannelType.GuildText,
      parent: CATEGORY_ID,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: me.id, allow: [PermissionFlagsBits.ManageMessages] },
      ],
    });

    await member.voice.setChannel(vc);

    tempVCs.set(vc.id, { ownerId: member.id, vcId: vc.id, textId: text.id });

    await text.send(panelPayload(member.id, vc.id));
  }

  if (oldState.channelId && tempVCs.has(oldState.channelId)) {
    const vc = oldState.guild.channels.cache.get(oldState.channelId);
    if (vc && vc.members.size === 0) {
      const data = tempVCs.get(vc.id);
      tempVCs.delete(vc.id);
      vc.delete().catch(() => {});
      oldState.guild.channels.cache.get(data.textId)?.delete().catch(() => {});
    }
  }
});

// ----------------------
// COMMANDS
// ----------------------
client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;

  console.log("📩 MESSAGE:", msg.content);

  // -------- PANEL
  if (msg.content === "-panel") {
    const member = await msg.guild.members.fetch(msg.author.id);
    const vc = member.voice.channel;
    if (!vc) return msg.reply("❌ Join your temp VC.");

    const data = tempVCs.get(vc.id);
    if (!data) return;

    if (msg.author.id !== data.ownerId && !isStaff(member))
      return msg.reply("❌ Not allowed.");

    msg.guild.channels.cache.get(data.textId)
      ?.send(panelPayload(data.ownerId, data.vcId));
  }

  // -------- CLEAR OWNER
  if (msg.content === "#clearowner") {
    const member = await msg.guild.members.fetch(msg.author.id);
    if (!isStaff(member))
      return msg.reply("❌ Staff only.");

    const since = Date.now() - 24 * 60 * 60 * 1000;
    let total = 0;

    for (const channel of msg.guild.channels.cache.values()) {
      if (!channel.isTextBased()) continue;

      let messages;
      try {
        messages = await channel.messages.fetch({ limit: 100 });
      } catch {
        continue;
      }

      const target = messages.filter(
        m => m.author.id === OWNER_TARGET_ID && m.createdTimestamp >= since
      );

      if (target.size) {
        await channel.bulkDelete(target, true).catch(() => {});
        total += target.size;
      }
    }

    msg.reply(`🧹 Deleted **${total}** owner messages.`);
  }
});

// ----------------------
// BUTTONS
// ----------------------
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  const data = [...tempVCs.values()].find(d => d.textId === interaction.channelId);
  if (!data) return;

  const vc = interaction.guild.channels.cache.get(data.vcId);
  if (!vc) return;

  if (interaction.customId === "lock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
    return interaction.reply({ content: "🔒 Locked", ephemeral: true });
  }

  if (interaction.customId === "unlock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: true });
    return interaction.reply({ content: "🔓 Unlocked", ephemeral: true });
  }

  if (interaction.customId === "claim") {
    data.ownerId = interaction.user.id;
    return interaction.reply({ content: "👑 Claimed", ephemeral: true });
  }

  if (interaction.customId === "pull_panel") {
    interaction.channel.send(panelPayload(data.ownerId, data.vcId));
    return interaction.reply({ content: "📌 Panel pulled", ephemeral: true });
  }
});

// ----------------------
// LOGIN
// ----------------------
client.login(process.env.TOKEN);
