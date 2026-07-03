// premiumTemplates.local.example.js: tracked example of the GITIGNORED local slot
// src/data/premiumTemplates.local.js.
//
// Premium campaign content (t3+) is authored in the private content repo and is
// synced into the local slot for playtesting (see that repo's scripts/sync-local.sh);
// players eventually receive it via the server-delivered content channel (#40).
// The merge mechanism (storyTemplates.js, mergeLocalTemplates + require.context)
// is public; the content never enters this repo.
//
// Shape: export a `premiumTemplates` array of full story-template objects (same
// shape as the public t1/t2 entries). An entry whose `id` matches a public template
// REPLACES it (e.g. a comingSoon t3 stub becomes playable locally), and entries
// with new ids are appended to the picker data.
//
// export const premiumTemplates = [
//   {
//     id: 'heroic-fantasy-t3',   // matches the public comingSoon stub -> replaces it
//     theme: 'heroic-fantasy',
//     tier: 3,
//     levelRange: [5, 7],
//     name: 'Heroic Fantasy',
//     subtitle: 'The Shattered Throne',
//     icon: '⚔️',
//     description: '...',
//     premium: true,
//     comingSoon: false,
//     customNames: { towns: ['...'], mountains: ['...'] },
//     settings: {
//       shortDescription: '...',
//       campaignGoal: '...',
//       milestones: [/* item / talk / narrative / location / combat, per the legend */],
//       grimnessLevel: 'Noble', darknessLevel: 'Bright',
//       magicLevel: 'High Magic', technologyLevel: 'Medieval',
//       responseVerbosity: 'Descriptive'
//     }
//   }
// ];
export const premiumTemplates = [];
