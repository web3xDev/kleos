import { AgentProfile } from "@/components/agent-profile";

export default async function AgentPage({ params }: PageProps<"/a/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-4 pb-32 pt-24 md:px-8">
        <h1 className="text-[40px] font-semibold leading-none tracking-tight">Not an agent id</h1>
      </main>
    );
  }
  return <AgentProfile agentId={BigInt(id)} />;
}
