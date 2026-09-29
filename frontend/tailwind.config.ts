import type { Config } from "tailwindcss";
const config: Config = { darkMode:"class",content:["./src/**/*.{js,ts,jsx,tsx,mdx}"],theme:{extend:{colors:{ink:"#0c111b",panel:"#121a27",line:"#243044",mint:"#54e0bd",blue:"#81aaff"},fontFamily:{sans:["Inter","ui-sans-serif","system-ui"]},boxShadow:{glow:"0 0 32px rgba(84,224,189,.12)"}}},plugins:[]};
export default config;
