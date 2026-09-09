import { GameApp } from "../../../components/GameApp";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<React.ReactElement> {
  const { code } = await params;
  return <GameApp initialCode={code.toUpperCase()} />;
}
