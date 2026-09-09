import { NextResponse } from "next/server";

const startedAt = Date.now();

export function GET(): NextResponse {
  return NextResponse.json({
    status: "ok",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    version: process.env.npm_package_version ?? "0.1.0",
  });
}
