import { NewCourseForm } from "@/components/lms/NewCourseForm";

export const metadata = { title: "New course — Central Nursing Systems" };

/**
 * Course creation asks for two things and nothing more. Everything else is
 * edited in place in the builder — the fastest way to lose an instructor is a
 * twelve-field form before they have seen the product.
 */
export default function NewCoursePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">New course</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Two details to get started. You can change both later.
        </p>
      </header>
      <NewCourseForm />
    </div>
  );
}
