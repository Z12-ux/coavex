import { notFound, redirect } from "next/navigation";
import { pageUser, assertClientInOrg } from "@/server/auth/session";
import { loadWorkoutModeData } from "@/server/workouts";
import { coachCompleteWorkoutAction } from "@/server/actions/programs";
import { WorkoutMode } from "@/components/workout-mode";

export const dynamic = "force-dynamic";

/** Coach Workout Mode: log a client's session on the gym floor. */
export default async function CoachTrainPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const user = await pageUser("staff");
  const { id, sessionId } = await params;
  await assertClientInOrg(id, user.orgId);
  const data = await loadWorkoutModeData(sessionId, id, user.locale);
  if (!data) notFound();
  if (data.session.status === "COMPLETED") redirect(`/clients/${id}?tab=training`);
  return (
    <WorkoutMode
      locale={user.locale}
      sessionId={sessionId}
      workoutName={data.workoutName}
      focus={data.focus}
      minutes={data.minutes}
      isShortened={data.isShortened}
      personName={data.personName}
      backHref={`/clients/${id}?tab=training`}
      warnings={data.warnings}
      exercises={data.exercises}
      submit={coachCompleteWorkoutAction}
    />
  );
}
