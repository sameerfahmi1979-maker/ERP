/** Watermark — renders text or image watermark behind page content */
import React from "react";
interface WatermarkProps { text?: string; imageUrl?: string; }
export function Watermark({ text, imageUrl }: WatermarkProps) {
  if (imageUrl) return <img src={imageUrl} alt="" className="watermark-img" aria-hidden="true" />;
  if (text) return <div className="watermark" aria-hidden="true">{text}</div>;
  return null;
}
