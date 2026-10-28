// Public links and settings shown in the app. No keys or secrets belong in this file.
export const SIGNUP_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfPZnbqCWdiCBO8g8TZRd0oPQL3iPOcBgiB5crFnz-EGZoh8A/viewform";
export const LINKEDIN_URL = "https://www.linkedin.com/in/jared-potter/";
export const REPO_URL = "https://github.com/Jpotta111/kol-command-center-public";

// Email signup gate. Submissions go to the Google Form above (and its linked Sheet).
//   "after-first-search": the first search is free; exporting, AI briefs and further searches need an email.
//   "entry": an email is needed before using the tool at all.
//   "off": no gate.
export const GATE_MODE = "after-first-search";
export const SIGNUP_FORM = {
  postUrl:
    "https://docs.google.com/forms/d/e/1FAIpQLSfPZnbqCWdiCBO8g8TZRd0oPQL3iPOcBgiB5crFnz-EGZoh8A/formResponse",
  emailEntry: "entry.642396791",
  roleEntry: "entry.1440242624",
  noteEntry: "entry.239324591",
};
export const ROLES = [
  "Medical Affairs or MSL",
  "Physician or clinician",
  "Researcher or academic",
  "Industry (pharma, biotech, device, health tech)",
];
