import { SIGNUP_FORM, ROLES } from "../config";

const FLAG = "kol_discover_lite_signed_up_v1";
let memoryFlag = false;

export function isSignedUp() {
  if (memoryFlag) return true;
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

function markSignedUp() {
  memoryFlag = true;
  try {
    localStorage.setItem(FLAG, "1"); // a flag only; the email itself is not stored in the browser
  } catch {
    // storage unavailable; the in-memory flag lasts for this visit
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Send the signup to the Google Form. The response is opaque (no-cors), so success is assumed if the request is sent. */
export async function submitSignup({ email, role, note }) {
  const body = new URLSearchParams();
  body.set(SIGNUP_FORM.emailEntry, email.trim());
  if (role) {
    if (ROLES.includes(role)) {
      body.set(SIGNUP_FORM.roleEntry, role);
    } else {
      body.set(SIGNUP_FORM.roleEntry, "__other_option__");
      body.set(`${SIGNUP_FORM.roleEntry}.other_option_response`, role);
    }
  }
  if (note) body.set(SIGNUP_FORM.noteEntry, note.trim());
  await fetch(SIGNUP_FORM.postUrl, { method: "POST", mode: "no-cors", body });
  markSignedUp();
}
