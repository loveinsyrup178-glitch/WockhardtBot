const {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
    PermissionsBitField
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// Store Temporary Voice Channels
const tempVCs = new Map();

// The channel they click to generate a temp VC
const CREATION_CHANNEL_ID = "1447154911627186206"; // ← your channel

client.once(Events.ClientReady, () => {
    console.log(`${client.user.tag} is now online 💜`);
});

// When a user joins the creation channel → create VC
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (newState.channelId === CREATION_CHANNEL_ID) {

        const guild = newState.guild;
        const member = newState.member;

        // Create a new temp voice channel
        const tempChannel = await guild.channels.create({
            name: `💜 Wockhardt Voice Master — ${member.user.username} VC`,
            type: 2, // Voice
            parent: newState.channel.parentId,
            permissionOverwrites: [
                {
                    id: member.id,
                    allow: [
                        PermissionsBitField.Flags.Connect,
                        PermissionsBitField.Flags.ManageChannels
                    ]
                },
                {
                    id: guild.roles.everyone.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.Connect
                    ]
                }
            ]
        });

        // Move user into their new VC
        await newState.setChannel(tempChannel);

        // Save temp VC info
        tempVCs.set(tempChannel.id, {
            owner: member.id,
            id: tempChannel.id
        });
    }

    // Delete empty temp VCs
    if (oldState.channelId && tempVCs.has(oldState.channelId)) {
        const tempData = tempVCs.get(oldState.channelId);
        const channel = oldState.guild.channels.cache.get(tempData.id);

        if (channel && channel.members.size === 0) {
            await channel.delete().catch(() => {});
            tempVCs.delete(oldState.channelId);
        }
    }
});

// Slash command handler
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;
    const vc = interaction.member.voice.channel;

    if (!vc) {
        return interaction.reply({
            content: "❌ You must be inside your temp VC.",
            ephemeral: true
        });
    }

    const temp = tempVCs.get(vc.id);
    if (!temp || temp.owner !== interaction.user.id) {
        return interaction.reply({
            content: "❌ Only the **owner** of this VC can use these commands.",
            ephemeral: true
        });
    }

    // Lock command
    if (cmd === "lock") {
        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
            Connect: false
        });

        return interaction.reply("🔒 Your VC is **locked**.");
    }

    // Unlock command
    if (cmd === "unlock") {
        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
            Connect: true
        });

        return interaction.reply("🔓 Your VC is **unlocked**.");
    }
});

// LOGIN USING ENV VARIABLE
client.login(process.env.TOKEN);
