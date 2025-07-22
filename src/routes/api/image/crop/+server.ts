import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// Type-safe conditional import
let sharp: typeof import("sharp") | undefined;
if (import.meta.env.DEV) {
  try {
    const sharpModule = await import("sharp");
    sharp = sharpModule.default;
  } catch {
    console.warn("Sharp not available in development mode");
  }
}

export const GET: RequestHandler = async ({ url, fetch }) => {
  const imageUrl = url.searchParams.get("url");
  const x = parseInt(url.searchParams.get("x") || "0");
  const y = parseInt(url.searchParams.get("y") || "0");
  const width = parseInt(url.searchParams.get("width") || "800");
  const height = parseInt(url.searchParams.get("height") || "600");
  const quality = parseInt(url.searchParams.get("quality") || "80");

  if (!imageUrl) {
    throw error(400, "Missing image URL");
  }

  try {
    if (import.meta.env.DEV && sharp) {
      // Development: Use Sharp with exact same processing as before
      const response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(10000),
        headers: {
          Accept: "image/*",
          "User-Agent": "Playlist-Service/1.0",
        },
      });

      if (!response.ok) {
        throw error(
          response.status,
          `Failed to fetch image: ${response.status}`,
        );
      }

      const imageBuffer = await response.arrayBuffer();

      // Now sharp is the constructor function, call it with imageBuffer
      const processedImageBuffer = await sharp(imageBuffer, {
        failOnError: false,
        density: 72,
      })
        .extract({
          left: Math.max(0, x),
          top: Math.max(0, y),
          width: Math.max(1, width),
          height: Math.max(1, height),
        })
        .jpeg({
          quality: quality,
          progressive: true,
          mozjpeg: true,
        })
        .toBuffer();

      return new Response(processedImageBuffer, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } else {
      // Production: Use Vercel's image optimization
      const approximateCropUrl = `/_vercel/image?url=${encodeURIComponent(imageUrl)}&w=${width}&h=${height}&q=${quality}&fit=cover`;

      const croppedResponse = await fetch(approximateCropUrl);

      if (!croppedResponse.ok) {
        throw error(
          croppedResponse.status,
          `Failed to process image: ${croppedResponse.status}`,
        );
      }

      const croppedBuffer = await croppedResponse.arrayBuffer();

      return new Response(croppedBuffer, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  } catch (err) {
    console.error("Image processing failed:", err);
    throw error(500, "Image processing failed");
  }
};
