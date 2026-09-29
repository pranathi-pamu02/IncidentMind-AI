import type { Metadata } from "next";
import "./globals.css";
import "./ui.css";
export const metadata:Metadata={title:"IncidentMind AI — Incident response with memory",description:"Operational memory and AI-assisted incident response"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
