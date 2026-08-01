# Learner data lifecycle

This inventory is the release-gate record for fields stored in the family learning workspace. The parent or guardian account is the consent boundary; a learner never needs an email account.

## Learner profile fields

| Field | Why it is necessary | Storage | Retention | Deletion path | Consent |
| --- | --- | --- | --- | --- | --- |
| `display_name` | Lets a guardian distinguish learners and select the correct learning record. The UI asks for a nickname and explicitly recommends not using a legal name. | `public.learning_profiles.display_name`, protected by household-membership RLS. | Until the guardian deletes the learner profile or the household is deleted. No archival copy is kept by this application. | The signed-in owner or guardian uses the learner's **Delete learner data** action. The profile delete cascades to `learning_profile_states`; the local copy is removed by the same flow. | Explicit guardian confirmation is required in the delete/create UI. |
| `grade_level` | Selects age-appropriate content and labels the learner profile. | `public.learning_profiles.grade_level`, protected by household-membership RLS. | Same as `display_name`. | Deleted with the learner profile through the guardian delete flow. | Explicit guardian confirmation is required when creating the learner profile. |
| `avatar_key` | Reserved for a predefined, non-uploaded icon so the family can distinguish profiles without storing a photo. | `public.learning_profiles.avatar_key`, protected by household-membership RLS. It must remain a predefined key, never an image or URL. | Same as `display_name`; currently null unless a future UI selects a predefined icon. | Deleted with the learner profile through the guardian delete flow. | Explicit guardian confirmation is required before use. |

## Learning state

The JSON state in `public.learning_profile_states.state` contains check-ins, points, shelf flags, reading flags, and reading-log records for the selected learner. It is limited to 1 MiB, protected by household-membership RLS, and retained only until the learner profile is deleted. The local cache uses browser `localStorage` and is cleared by the account dialog's local-data action or by the learner deletion flow.

## Operational constraints

- No learner email, phone number, birthday, school, address, precise location, photo, advertising identifier, or third-party analytics identifier is collected.
- A guardian must be signed in to create, update, or delete a learner profile; anonymous users have no table privileges.
- Export and whole-account deletion remain a pre-release operational requirement and must be implemented before production launch. The learner-profile deletion path above is available for the current family workspace scope.
