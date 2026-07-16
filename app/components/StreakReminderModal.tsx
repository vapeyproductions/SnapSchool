import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function StreakReminderModal({
  reminderMessage,
}: {
  reminderMessage: string;
}) {
  return (
    <DialogContent className="rounded-2xl border-orange-200 bg-gradient-to-br from-orange-500 to-rose-500 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="text-center text-2xl text-gray-50">
          Streak Reminder 🔥
        </DialogTitle>
        <DialogDescription className="text-center text-orange-100">
          Share a daily progress update to keep your learning streak going.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col items-center justify-center space-y-4">
        <p className="font-bold text-gray-50">{reminderMessage}</p>
      </div>
    </DialogContent>
  );
}
