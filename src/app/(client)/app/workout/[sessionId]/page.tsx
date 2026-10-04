import { notFound, redirect } from "next/navigation";
import { pageUser } from "@/server/auth/session";
import { loadWorkoutModeData } from "@/server/workouts";
import { completeWorkoutAction } from "@/server/actions/client-app";
import { WorkoutMode } from "@/components/workout-mode";

export const dynamic = "force-dynamic";

export default async function WorkoutPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await pageUser("client");
  const { sessionId } = await params;
  const data = await loadWorkoutModeData(sessionId, user.clientId!, user.locale);
  if (!data) notFound();
  if (data.session.status === "COMPLETED") redirect("/app");
  return (
    <WorkoutMode
      locale={user.locale}
      sessionId={sessionId}
      workoutName={data.workoutName}
      focus={data.focus}
      minutes={data.minutes}
      isShortened={data.isShortened}
      backHref="/app"
      warnings={data.warnings}
      exercises={data.exercises}
      submit={completeWorkoutAction}
    />
  );
}
