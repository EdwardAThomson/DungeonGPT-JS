export const storyTemplates = [
    {
        id: 'heroic-fantasy',
        name: 'Heroic Fantasy',
        icon: '⚔️',
        description: 'A classic tale of heroes, magic, and clear conflicts between good and evil.',
        customNames: ['Eldoria', 'Sunfire', 'Oakhaven', 'Silverton'],
        settings: {
            shortDescription: 'In the kingdom of Eldoria, light-hearted adventurers set out to recover the lost Crown of Sunfire and unite the shattered provinces against a rising darkness.',
            campaignGoal: 'Recover the Crown of Sunfire and defeat the Shadow Overlord to restore peace to Eldoria.',
            milestones: [
                'Find the hidden map in the archives of Oakhaven.',
                'Convince the Silver Guard to join the resistance.',
                'Locate the Sunfire Vault deep within the Cinder Mountains.'
            ],
            grimnessLevel: 'Noble',
            darknessLevel: 'Bright',
            magicLevel: 'High Magic',
            technologyLevel: 'Medieval',
            responseVerbosity: 'Descriptive'
        }
    },
    {
        id: 'grimdark-survival',
        name: 'Grimdark Survival',
        icon: '💀',
        description: 'A bleak world where survival is the only victory and every choice has a price.',
        customNames: ['Rotfall', 'Ironhold', 'Shadow-Crest', 'Pale-Reach'],
        settings: {
            shortDescription: 'The empire has fallen to the rot. Survivors huddle in the ruins of once-great cities, fighting for scraps while monsters—both human and otherwise—prowl the shadows.',
            campaignGoal: 'Secure a safe haven from the rot and find a permanent way to cleanse the spreading plague.',
            milestones: [
                'Establish a fortified camp in the ruins of Ironhold.',
                'Capture a mutated specimen for the alchemist at Pale-Reach.',
                'Destroy the Rot-Heart growing in the depths of Rotfall.'
            ],
            grimnessLevel: 'Grim',
            darknessLevel: 'Dark',
            magicLevel: 'Low Magic',
            technologyLevel: 'Medieval',
            responseVerbosity: 'Concise'
        }
    },
    {
        id: 'arcane-renaissance',
        name: 'Arcane Renaissance',
        icon: '🔮',
        description: 'A world of booming industry, discovery, and the dangerous fusion of magic and machine.',
        customNames: ['Novaris', 'Aether-Gate', 'Steam-Wharf', 'Cog-Hill'],
        settings: {
            shortDescription: 'The discovery of Aether-Steam has transformed the city of Novaris. Alchemists and engineers work side-by-side, but the old gods are not pleased with the noise of progress.',
            campaignGoal: 'Uncover the conspiracy behind the Aether-Steam accidents and prevent the awakening of the Old Gods.',
            milestones: [
                'Investigate the explosion at the Cog-Hill foundry.',
                'Retrieve the stolen blueprints from the Aether-Gate syndicate.',
                'Consult the Oracle of Steam in the depths of the Steam-Wharf.'
            ],
            grimnessLevel: 'Neutral',
            darknessLevel: 'Grey',
            magicLevel: 'Arcane Tech',
            technologyLevel: 'Renaissance',
            responseVerbosity: 'Moderate'
        }
    },
    {
        id: 'eldritch-horror',
        name: 'Eldritch Horror',
        icon: '🐙',
        description: 'Mystery and dread in a world where gods are uncaring and knowledge is a burden.',
        customNames: ['Blackwood', 'Whisper-Cove', 'Mourn-Peak', 'Abyssal-Rest'],
        settings: {
            shortDescription: 'In the mist-shrouded town of Blackwood, the stars have aligned. Unspeakable entities stir in the depths, and those who seek the truth often lose their minds before they find it.',
            campaignGoal: 'Seal the Abyssal Breach and prevent the Great Dreamer from awakening.',
            milestones: [
                'Decode the ritual text found in the Blackwood library.',
                'Cleanse the corrupted lighthouse at Whisper-Cove.',
                'Survive a vision of the Void at the summit of Mourn-Peak.'
            ],
            grimnessLevel: 'Bleak',
            darknessLevel: 'Dark',
            magicLevel: 'Low Magic',
            technologyLevel: 'Industrial',
            responseVerbosity: 'Descriptive'
        }
    }
];
