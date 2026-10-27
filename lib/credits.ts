export type CreditEntry = {
  id: string;
  displayOrder: number;
  assetName: string;
  originalTitle: string;
  creator: string;
  creatorOrPublisher: string;
  sourceUrl: string;
  licenseName: string;
  licenseShortName: string;
  licenseUrl: string;
  attributionText: string;
  modifications: readonly string[];
  additionalNotice?: string;
};

const ccByUrl = 'https://creativecommons.org/licenses/by/4.0/';

export const credits: readonly CreditEntry[] = [
  {
    id: 'football',
    displayOrder: 1,
    assetName: 'Football',
    originalTitle: 'Football',
    creator: 'Amal Kumar',
    creatorOrPublisher: 'Amal Kumar / Poly Haven',
    sourceUrl: 'https://polyhaven.com/a/football',
    licenseName: 'CC0 1.0 Universal',
    licenseShortName: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionText: '"Football" by Amal Kumar / Poly Haven, released under CC0 1.0 Universal.',
    modifications: [
      'Retained the inflated version of the original model.',
      'Replaced the worn textures with a custom pearl-white and charcoal star pattern, without logos or text.',
      'Centered the model origin.',
      'Scaled the model to approximately 0.22 metres in diameter.',
      'Optimized the textures and exported the asset as a web-ready GLB.',
      'Preserved the original mesh geometry.',
    ],
    additionalNotice: 'CC0 attribution is voluntary, but it is included here to acknowledge the original creator. No additional notice is required by the supplied attribution text.',
  },
  {
    id: 'gaming-chair',
    displayOrder: 2,
    assetName: 'Gaming Chair',
    originalTitle: 'Gaming chair',
    creator: 'Vlad',
    creatorOrPublisher: 'Vlad',
    sourceUrl: 'https://skfb.ly/oE8u7',
    licenseName: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    licenseShortName: 'CC BY 4.0',
    licenseUrl: ccByUrl,
    attributionText: '"Gaming chair" by Vlad, licensed under Creative Commons Attribution 4.0 International.',
    modifications: [
      'Recoloured the original chair model to an all-black finish.',
      'Reduced its polygon count for web rendering.',
      'Simplified the material structure.',
      'Resized and optimized the textures.',
      'Normalized the model scale and origin.',
      'Exported the optimized asset as Draco-compressed GLB files for browser use.',
    ],
    additionalNotice: 'This is a modified version of the original model. Attribution does not imply endorsement by the original creator.',
  },
  {
    id: 'gaming-pc',
    displayOrder: 3,
    assetName: 'Gaming PC with RGB Lighting',
    originalTitle: 'Gaming Pc with RGB lighting',
    creator: 'fakiAZer',
    creatorOrPublisher: 'fakiAZer',
    sourceUrl: 'https://skfb.ly/oTMZX',
    licenseName: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    licenseShortName: 'CC BY 4.0',
    licenseUrl: ccByUrl,
    attributionText: '"Gaming Pc with RGB lighting" by fakiAZer, licensed under Creative Commons Attribution 4.0 International.',
    modifications: [
      'Optimized model geometry and compressed the asset for browser use.',
      'Replaced the original front fan assembly with two blue RGB fans and a mesh grille.',
      'Added independent rotation pivots and animation clips for two front fans, one rear fan, and three top fans.',
      'Kept the fan housings and RGB rings stationary while the fan blades rotate.',
      'Adjusted the glass and other materials.',
      'Added internal accent lighting.',
      'Standardized the model scale for the 3D room.',
    ],
    additionalNotice: 'The original creator does not endorse this adaptation.',
  },
  {
    id: 'mechanical-keyboard',
    displayOrder: 4,
    assetName: 'Mechanical RGB Keyboard',
    originalTitle: 'Mechanical RGB Keyboard',
    creator: 'BigBrotherHCH',
    creatorOrPublisher: 'BigBrotherHCH',
    sourceUrl: 'https://skfb.ly/6Ru6Z',
    licenseName: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    licenseShortName: 'CC BY 4.0',
    licenseUrl: ccByUrl,
    attributionText: '"Mechanical RGB Keyboard" by BigBrotherHCH, licensed under Creative Commons Attribution 4.0 International.',
    modifications: [
      'Converted the supplied RGB keyboard FBX into an optimized GLB.',
      'Simplified the model geometry.',
      'Reduced and recompressed textures.',
      'Optimized the model to remain below 100 KB.',
      'Replaced the original procedural keyboard in the MyVerse workstation.',
      "Integrated the model's existing emissive RGB materials with the room lighting.",
      'Synchronized the keyboard lighting with the shared workstation startup sequence.',
    ],
    additionalNotice: 'This is a modified adaptation of the original keyboard model. Attribution does not imply endorsement by the original creator.',
  },
];
