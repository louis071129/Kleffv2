import { NextResponse } from "next/server";
import { getGameServer } from "../../../server/game-server.js";

export function GET(): NextResponse {
  return NextResponse.json(getGameServer().health());
}
