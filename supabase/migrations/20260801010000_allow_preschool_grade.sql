-- Allow preschool (grade_level = 0) in addition to K12 grades 1-12.
ALTER TABLE public.learning_profiles DROP CONSTRAINT IF EXISTS learning_profiles_grade_level_check;
ALTER TABLE public.learning_profiles ADD CONSTRAINT learning_profiles_grade_level_check
  CHECK (grade_level between 0 and 12);
