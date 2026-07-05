import SupportChannelsView from "@/components/support/SupportChannelsView";

export default function StudentSupportPage() {
  return (
    <div
      className="fixed inset-0 z-40 bg-background overflow-y-auto"
      dir="rtl"
      style={{
        top: "max(env(safe-area-inset-top), var(--status-bar-offset, 0px))",
        height: "calc(100dvh - max(env(safe-area-inset-top), var(--status-bar-offset, 0px)))",
      }}
    >
      <SupportChannelsView audience="student" assistantPath="/support/assistant" />
    </div>
  );
}
