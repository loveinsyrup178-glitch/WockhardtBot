// =====================================
// WOCKHARDT — ADVANCED TEMP VC SYSTEM
// LOCK • UNLOCK • LIMIT • RENAME • CLAIM
// =====================================

const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// -------------------------------------
// YOUR SERVER SETTINGS (UPDATED)
// -------------------------------------
const CREATE_VC_ID = "1451498864350859264";        // click-to-create VC
const CATEGORY_ID  = "1411585822708469861";        // temp VC category
const CONTROL_PANEL_CHANNEL = "1451604392007569480"; // control panel channel

const TEMP_NAME = "💜・{username}";

// Track temporary VCs
const tempVCs = new Map();

// -------------------------------------
// READY
// -------------------------------------
client.once("ready", () => {
    console.log(`💜 ${client.user.tag} is online`);
});

// -------------------------------------
// CREATE CONTROL PANEL MESSAGE
// -------------------------------------
function controlPanel(member, channel) {
    return {
        content: `💜 **Temp VC created for <@${member.id}>**\n${channel}`,
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("lock")
                    .setLabel("🔒 Lock")
                    .setStyle(ButtonStyle.Danger),

                new ButtonBuilder()
                    .setCustomId("unlock")
                    .setLabel("🔓 Unlock")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId("limit")
                    .setLabel("👥 Limit")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId("rename")
                    .setLabel("✏️ Rename")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("claim")
                    .setLabel("👑 Claim")
                    .setStyle(ButtonStyle.Success)
            )
        ]
    };
}

// -------------------------------------
// CREATE TEMP VC WHEN USER JOINS
// -------------------------------------
client.on("voiceStateUpdate", async (oldState, newState) => {

    if (newState.channelId === CREATE_VC_ID) {
        const guild = newState.guild;
        const member = newState.member;

        const name = TEMP_NAME.replace("{username}", member.user.username);

        // Create new VC
        const newVC = await guild.channels.create({
            name,
            type: 2,
            parent: CATEGORY_ID,
            permissionOverwrites: [
                { id: member.id, allow: ["Connect", "ManageChannels"] },
                { id: guild.roles.everyone.id, allow: ["ViewChannel", "Connect"] }
            ]
        });

        // Move user into it
        await member.voice.setChannel(newVC).catch(() => {});

        // Save VC ownership
        tempVCs.set(newVC.id, {
            owner: member.id,
            channel: newVC
        });

        // Send control panel
        const panel = guild.channels.cache.get(CONTROL_PANEL_CHANNEL);
        if (panel) panel.send(controlPanel(member, newVC));
    }

    // DELETE VC when empty
    if (oldState.channelId && tempVCs.has(oldState.channelId)) {
        const data = tempVCs.get(oldState.channelId);
        const vc = data.channel;

        if (vc.members.size === 0) {
            tempVCs.delete(vc.id);
            vc.delete().catch(() => {});
        }
    }
});

// -------------------------------------
// BUTTON INTERACTIONS
// -------------------------------------
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const member = interaction.guild.members.cache.get(interaction.user.id);
    const vc = member?.voice?.channel;
    if (!vc) return interaction.reply({ content: "❌ You must be in a temporary VC.", ephemeral: true });

    const data = tempVCs.get(vc.id);
    if (!data) return interaction.reply({ content: "❌ This is not a temp VC.", ephemeral: true });

    if (interaction.user.id !== data.owner)
        return interaction.reply({ content: "❌ Only the VC owner can do that.", ephemeral: true });

    // --- LOCK VC ---
    if (interaction.customId === "lock") {
        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: false });
        return interaction.reply({ content: "🔒 The VC has been locked.", ephemeral: true });
    }

    // --- UNLOCK VC ---
    if (interaction.customId === "unlock") {
        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: true });
        return interaction.reply({ content: "🔓 The VC has been unlocked.", ephemeral: true });
    }

    // --- SET LIMIT ---
    if (interaction.customId === "limit") {
        await interaction.reply({ content: "Send the new user limit (number).", ephemeral: true });

        const filter = m => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 15000 });

        if (!collected.size) return;
        const num = parseInt(collected.first().content);
        if (isNaN(num)) return collected.first().reply("❌ Invalid number.");

        await vc.setUserLimit(num);
        return collected.first().reply(`👥 Limit set to **${num}**.`);
    }

    // --- RENAME ---
    if (interaction.customId === "rename") {
        await interaction.reply({ content: "Send the new channel name.", ephemeral: true });

        const filter = m => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 15000 });

        if (!collected.size) return;
        const newName = collected.first().content.slice(0, 40);

        await vc.setName(newName);
        return collected.first().reply(`✏️ Renamed to **${newName}**.`);
    }

    // --- CLAIM OWNERSHIP ---
    if (interaction.customId === "claim") {
        data.owner = interaction.user.id;
        tempVCs.set(vc.id, data);
        return interaction.reply({ content: "👑 You now own this VC.", ephemeral: true });
    }
});

// -------------------------------------
// LOGIN (TOKEN FROM ENV VARIABLES)
// -------------------------------------
client.login(process.env.TOKEN);
