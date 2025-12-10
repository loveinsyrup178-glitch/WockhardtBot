const { Client, GatewayIntentBits, Partials, Events, PermissionsBitField } = require("discord.js");

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

// Store Temporary VC Data
const tempVCs = new Map();

// ID of the channel users must click to create a temp VC
const CREATION_CHANNEL_ID = "1447154911627186206"; // your source VC

client.once(Events.ClientReady, () => {
    console.log(`${client.user.tag} is online!`);
});

// When user joins creation VC → create temp VC
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (newState.channelId === CREATION_CHANNEL_ID) {
        const guild = newState.guild;
        const user = newState.member;

        const newVC = await guild.channels.create({
            name: `💜・${user.user.username}`,
            type: 2,
            parent: newState.channel.parentId,
            permissionOverwrites: [
                {
                    id: user.id,
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

        // Move user into the new channel
        await newState.setChannel(newVC);

        // Save ownership
        tempVCs.set(newVC.id, {
            owner: user.id,
            id: newVC.id
        });
    }

    // Auto-delete VC when empty
    if (oldState.channelId && tempVCs.has(oldState.channelId)) {
        const data = tempVCs.get(oldState.channelId);
        const channel = oldState.guild.channels.cache.get(data.id);

        if (channel && channel.members.size === 0) {
            await channel.delete().catch(() => {});
            tempVCs.delete(oldState.channelId);
        }
    }
});

// Login with environment variable TOKEN
client.login(process.env.TOKEN);
