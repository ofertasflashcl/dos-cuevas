import { createFileRoute } from "@tanstack/react-router";
import { CosmosApp } from "@/components/cosmos-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <CosmosApp />;
}
