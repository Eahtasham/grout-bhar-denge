// The Mistri: an original flat cartoon (gamchha, trowel, big grin).
// One SVG source used by the UI, the share-card OG image and the story image.

export type MistriMood = "idle" | "happy" | "panic" | "king";

const SKIN = "#C98B5E";
const INK = "#1E1E1E";
const CHECK = "url(#gbd-check)";
const CHECK_DARK = "#1E1E1E";
const CHECK_LIGHT = "#F4F1EA";
const GAMCHHA = "#E4572E";
const OFFWHITE = "#F4F1EA";
const GROUT = "#8A8D91";
const TURMERIC = "#F2B705";
const WATER = "#3FA9F5";

function face(mood: MistriMood) {
  switch (mood) {
    case "happy":
    case "king":
      return `
      <path d="M72 80 Q81 74 90 79" fill="none"/>
      <path d="M110 79 Q119 74 128 80" fill="none"/>
      <path d="M74 97 Q82 87 90 97" fill="none"/>
      <path d="M110 97 Q118 87 126 97" fill="none"/>
      <path d="M78 126 Q100 156 122 126 Z" fill="#FFFFFF"/>`;
    case "panic":
      return `
      <path d="M71 74 Q80 64 90 71" fill="none"/>
      <path d="M110 71 Q120 64 129 74" fill="none"/>
      <circle cx="81" cy="94" r="9" fill="#FFFFFF"/>
      <circle cx="119" cy="94" r="9" fill="#FFFFFF"/>
      <circle cx="82" cy="95" r="3" fill="${INK}"/>
      <circle cx="118" cy="95" r="3" fill="${INK}"/>
      <ellipse cx="100" cy="136" rx="9" ry="11" fill="#5A1E14"/>
      <path d="M152 64 Q160 77 152 84 Q144 77 152 64 Z" fill="${WATER}"/>
      <path d="M44 70 Q50 80 44 86 Q38 80 44 70 Z" fill="${WATER}"/>`;
    default:
      return `
      <path d="M72 81 L90 79" fill="none"/>
      <path d="M110 79 L128 81" fill="none"/>
      <circle cx="82" cy="95" r="5" fill="${INK}"/>
      <circle cx="118" cy="95" r="5" fill="${INK}"/>
      <path d="M82 129 Q100 144 118 129" fill="none"/>`;
  }
}

function arm(mood: MistriMood) {
  const sleeve = `
    <path d="M46 206 Q22 176 30 134" fill="none" stroke="${INK}" stroke-width="24"/>
    <path d="M46 206 Q22 176 30 134" fill="none" stroke="${CHECK}" stroke-width="15"/>`;
  if (mood === "happy" || mood === "king") {
    return `${sleeve}
    <rect x="18" y="96" width="11" height="26" rx="5.5" fill="${SKIN}"/>
    <rect x="16" y="114" width="28" height="24" rx="7" fill="${SKIN}"/>
    <path d="M22 122 L38 122 M22 129 L38 129" fill="none" stroke-width="2.5"/>`;
  }
  return `${sleeve}
    <path d="M30 120 L30 100" fill="none" stroke="#8B5A2B" stroke-width="9"/>
    <path d="M30 120 L30 100" fill="none" stroke-width="2.5"/>
    <path d="M12 100 L48 100 L30 58 Z" fill="${GROUT}"/>
    <path d="M24 92 L30 74" fill="none" stroke="#C9CCD0" stroke-width="3"/>
    <circle cx="30" cy="130" r="11" fill="${SKIN}"/>`;
}

export function mistriSvg(mood: MistriMood = "idle"): string {
  const crown =
    mood === "king"
      ? `<path d="M64 52 L70 20 L85 40 L100 12 L115 40 L130 20 L136 52 Z" fill="${TURMERIC}"/>
         <circle cx="100" cy="40" r="4" fill="${GAMCHHA}"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" width="200" height="220">
<defs>
  <pattern id="gbd-check" width="18" height="18" patternUnits="userSpaceOnUse">
    <rect width="18" height="18" fill="${CHECK_LIGHT}"/>
    <rect width="9" height="9" fill="${CHECK_DARK}"/>
    <rect x="9" y="9" width="9" height="9" fill="${CHECK_DARK}"/>
  </pattern>
</defs>
<g stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
  <path d="M30 222 Q32 162 100 154 Q168 162 170 222 Z" fill="${CHECK}"/>
  <path d="M100 172 L100 222" fill="none" stroke="${CHECK_LIGHT}" stroke-width="9"/>
  <path d="M95.5 172 L95.5 222 M104.5 172 L104.5 222" fill="none" stroke-width="2.5"/>
  <circle cx="100" cy="188" r="3" fill="${CHECK_LIGHT}" stroke-width="2"/>
  <circle cx="100" cy="206" r="3" fill="${CHECK_LIGHT}" stroke-width="2"/>
  <path d="M116 158 Q150 158 164 178 L152 222 L128 222 L138 182 Q128 170 110 168 Z" fill="${GAMCHHA}"/>
  <path d="M146 172 L134 222 M156 182 L146 222" fill="none" stroke="${OFFWHITE}" stroke-width="4"/>
  <path d="M86 138 L86 158 Q100 166 114 158 L114 138 Z" fill="${SKIN}"/>
  <path d="M84 150 L100 170 L86 184 L74 160 Z" fill="${CHECK}"/>
  <path d="M116 150 L100 170 L114 184 L126 160 Z" fill="${CHECK}"/>
  <circle cx="54" cy="100" r="11" fill="${SKIN}"/>
  <circle cx="146" cy="100" r="11" fill="${SKIN}"/>
  <ellipse cx="100" cy="96" rx="46" ry="50" fill="${SKIN}"/>
  <path d="M54 94 Q50 44 100 42 Q152 42 146 94 Q140 66 118 62 Q100 74 76 64 Q60 70 54 94 Z" fill="${INK}"/>
  ${crown}
  ${face(mood)}
  <path d="M72 120 Q86 108 100 115 Q114 108 128 120 Q114 125 100 120 Q86 125 72 120 Z" fill="${INK}"/>
  ${arm(mood)}
</g>
</svg>`;
}

export function mistriDataUri(mood: MistriMood = "idle"): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mistriSvg(mood))}`;
}
