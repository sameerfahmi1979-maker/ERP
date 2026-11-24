export type Phase2FieldType = "text" | "identifier" | "date" | "integer" | "amount" | "boolean";
export type Phase2RenewalPolicy = "none" | "credential_expiry" | "coverage_end" | "tenancy_end";
export type Phase2DuplicatePolicy = "fingerprint_only" | "issuer_reference_subject";

export interface Phase2FieldRule {
  readonly key: string;
  readonly type: Phase2FieldType;
  readonly required: boolean;
  readonly labels: readonly string[];
  readonly dateRole?: string;
  readonly restricted?: boolean;
  readonly multiline?: boolean;
  readonly side?: "front" | "reverse";
  readonly fixedValue?: string;
  readonly valuePattern?: string;
  readonly sourceOnly?: boolean;
}

export interface Phase2Profile {
  readonly id: string;
  readonly purposeNumber: number;
  readonly displayName: string;
  readonly typeCode: string;
  readonly category: string;
  readonly status: "prototype" | "held";
  readonly evidence: readonly string[];
  readonly positiveMarkers: readonly string[];
  readonly negativeMarkers: readonly string[];
  readonly fields: readonly Phase2FieldRule[];
  readonly holdReason?: string;
  readonly tags: readonly string[];
  readonly duplicatePolicy: Phase2DuplicatePolicy;
  readonly renewalPolicy: Phase2RenewalPolicy;
  readonly holds: readonly string[];
  readonly actionRequirements: readonly string[];
}

export interface Phase2ExceptionRule {
  readonly id: string;
  readonly owner: "DMS" | "HR" | "HSE" | "Finance" | "Fleet";
  readonly disposition: "hold" | "reconcile" | "review";
  readonly requirements: readonly string[];
}

type ProfileOptions = Pick<Phase2Profile, "evidence" | "positiveMarkers" | "fields" | "actionRequirements">
  & Partial<Pick<Phase2Profile, "negativeMarkers" | "holdReason" | "tags" | "duplicatePolicy" | "renewalPolicy" | "holds">>;

function profile(
  purposeNumber: number,
  id: string,
  displayName: string,
  typeCode: string,
  category: string,
  options: ProfileOptions,
): Phase2Profile {
  return {
    purposeNumber, id, displayName, typeCode, category,
    status: options.holdReason ? "held" : "prototype",
    negativeMarkers: [], tags: [], duplicatePolicy: "fingerprint_only", renewalPolicy: "none", holds: [],
    ...options,
  };
}

const cues = (...patterns: RegExp[]) => patterns.map((pattern) => pattern.source);
const required = (field: Phase2FieldRule): Phase2FieldRule => ({ ...field, required: true });
const sensitive = (field: Phase2FieldRule): Phase2FieldRule => ({ ...field, restricted: true });
const field = (type: Phase2FieldType, key: string, labels: string[]): Phase2FieldRule => ({
  type, key, labels, required: false,
});
const txt = (key: string, ...labels: string[]) => field("text", key, labels);
const ref = (key: string, ...labels: string[]) => field("identifier", key, labels);
const count = (key: string, ...labels: string[]) => field("integer", key, labels);
const amount = (key: string, ...labels: string[]) => sensitive(field("amount", key, labels));
const date = (key: string, dateRole: string, ...labels: string[]): Phase2FieldRule => ({
  ...field("date", key, labels), dateRole,
});
const fact = (key: string, fixedValue: string, ...labels: string[]): Phase2FieldRule => ({
  ...required(txt(key, ...labels)), fixedValue,
});

const holder = required(txt("holder_name", "Holder Name", "Full Name", "Name", "الاسم"));
const employee = required(txt("employee_name", "Employee Name", "Employee", "Name", "اسم الموظف", "الاسم"));
const authority = required(txt("issuing_authority", "Issuing Authority", "Issued By", "جهة الإصدار"));
const issuer = required(txt("issuer", "Issuer", "Issued By", "Issuing Organization"));
const sponsor = txt("sponsor", "Sponsor Name", "Sponsor", "اسم الكفيل");
const employer = txt("employer", "Employer", "Establishment Name", "Company Name", "اسم المنشأة");
const passportNumber = sensitive(ref("passport_number", "Passport Number", "Passport No.", "Passport No", "رقم الجواز"));
const birth = sensitive(date("date_of_birth", "birth", "Date of Birth", "Birth Date", "D.O.B.", "تاريخ الميلاد"));
const nationality = txt("nationality", "Nationality", "الجنسية");
const issue = date("issue_date", "issued", "Date of Issue", "Issuing Date", "Issue Date", "تاريخ الإصدار");
const expiry = date("expiry_date", "credential_expiry", "Date of Expiry", "Expiry Date", "Expiration Date", "تاريخ الانتهاء");
const issuePlace = txt("place_of_issue", "Place of Issue", "Issuing Place", "مكان الإصدار");
const signed = txt("signature_evidence", "Signature Evidence", "Signed By", "Authorized Signatory");
const employmentRole = txt("job_title", "Job Title", "Position", "Profession", "Designation/Job", "المهنة");
const uid = sensitive(ref("unified_number", "U.I.D No", "U.I.D. No", "UID", "Unified Number", "الرقم الموحد"));
const entryDeadline = date("entry_deadline", "entry_deadline", "Valid Until", "Entry Deadline", "تاريخ صلاحية الدخول");
const entryPermit = required(ref("entry_permit_number", "Entry Permit No.", "Entry Permit No", "Entry Permit Number", "رقم إذن الدخول"));
const transaction = ref("transaction_number", "Transaction No", "Transaction No.", "Transaction Number", "رقم المعاملة");
const applicant = required(txt("applicant_name", "Applicant Name", "Name", "اسم مقدم الطلب"));
const member = required(txt("member_name", "Member Name", "Insured Name", "Name"));
const policy = required(ref("policy_number", "Policy Number", "Policy No.", "Policy No", "رقم الوثيقة"));
const provider = required(txt("provider", "Training Provider", "Training Organisation", "Training Organization", "Provider", "Training Centre"));
const participant = required(txt("participant_name", "Participant Name", "Candidate Name", "Name", "Trainee Name"));
const certificate = ref("certificate_number", "Certificate Number", "Certificate No.", "Certificate No", "Cert No");
const course = required(txt("course_title", "Course Title", "Training Course", "Course Name"));
const outcome = required(txt("printed_outcome", "Result", "Outcome", "Award Outcome", "Assessment Result"));
const trainingCourseDate = date("course_date", "training_date", "Course Date", "Held On", "Date of Training", "On");
const inductionCourseDate = { ...date("course_date", "training_date", "Course Date", "Held On", "Date of Training", "Attended Day(s)"), sourceOnly: true };
const awardDate = date("award_date", "award", "Awarded On", "Date of Award");
const coverageStart = date("coverage_start", "coverage_start", "Coverage Start", "Inception Date", "Effective Date", "Policy Start Date");
const coverageEnd = date("coverage_end", "coverage_end", "Coverage End", "Expiry Date", "Expiration Date", "Policy End Date");
const awardFields = [participant, provider, course, outcome, certificate, issue, trainingCourseDate, awardDate];
const typeForm = txt("form_status", "Status", "Application Status", "Approval Status");
const copyScope = ["Verified issuer, subject and company/branch scope.", "Use an authorized document policy and record the source page for each field."];
const credentialIdentity = ["Verified issuer, holder, credential reference and matching subject within authorized scope."];
const courseScope = ["Exact printed course and outcome, verified participant and issuer.", "Any qualification, equivalent course or operational link requires its own approved scope and evidence."];
const confirmedExpiry = ["Use only the expiry printed for this credential or an approved evidenced derivation. Review the predecessor before recording renewal."];
const fingerprintAndIdentity = "issuer_reference_subject" as const;
const credentialExpiry = "credential_expiry" as const;

const identityProfiles = [
  profile(1, "passport", "Passport", "PASSPORT_COPY", "HR", {
    evidence: ["HR-U33 pp2–3", "DOC004429 pp1–2", "DOC001255 p1", "DOC001587 p1", "DOC001599 p1", "DOC001116 p1", "DOC000686 p1", "DOC000750 p1", "DOC000364 p1", "DOC001021 p1", "DOC000351 p1"],
    positiveMarkers: cues(/^\s*(?:passport|reisepass|passeport|पासपोर्ट|جواز السفر)\s*$|\bP<[A-Z]{3}[A-Z<]{12,}/m, /date of birth|birth date|geburtstag|تاريخ الميلاد|\bP<[A-Z]{3}/, /date of expir|expiration|expiry|gültig bis|تاريخ الانتهاء|\bvalid until\b/),
    negativeMarkers: cues(/^\s*(?:residency permit|entry permit|driving licen[cs]e|visa cancellation)\s*$/m),
    fields: [
      required(passportNumber), holder, txt("surname", "Surname", "Family Name", "Nom", "اسم العائلة"),
      txt("given_names", "Given Names", "Given Name", "Forenames", "Prénoms", "الأسماء"),
      required(txt("issuer_country", "Issuing Country", "Country of Issue", "Country Code", "Code", "الدولة المصدرة")),
      required(birth), required(expiry), issue, issuePlace, nationality,
      sensitive(txt("mrz", "Machine Readable Zone", "MRZ")),
      sensitive(ref("former_passport_number", "Old Passport No", "Old Passport Number")),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...credentialIdentity, "Verify the biodata page and compare legible visual fields with the MRZ before action.", ...confirmedExpiry],
    holdReason: "Use a checked issuing-country layout for passport field extraction. Unknown issuing layouts need a reviewed original.",
    holds: ["A secondary particulars or endorsement page needs matched biodata.", "Review alternate issuer formats, conflicts and low-confidence MRZ reads."],
  }),
  profile(2, "emirates-id", "Emirates ID", "EMIRATES_ID", "HR", {
    evidence: ["DOC004359 pp1–2", "ID-N008 pp1–2", "ID-N027 p1"],
    positiveMarkers: cues(/resident identity card|golden card|بطاقة هوية مقيم/, /id\s*(?:number|no\.?)|رقم الهوية/),
    fields: [
      holder, { ...required(sensitive(ref("emirates_id_number", "ID Number", "ID No.", "Emirates ID Number", "رقم الهوية"))), valuePattern: "^(?:784[- ]?\\d{4}[- ]?\\d{7}[- ]?\\d)$" },
      required(birth), required(expiry), issue, nationality,
      sensitive(ref("card_number", "Card Number", "رقم البطاقة")), issuePlace,
      employmentRole, employer, fact("issuer_country", "AE", "United Arab Emirates", "الإمارات العربية المتحدة"),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...credentialIdentity, "Verify the official printed holder name and front/reverse pairing.", ...confirmedExpiry],
    holds: ["Citizen Emirates ID variant needs an independent original.", "A printed employer or occupation does not establish immigration sponsorship."],
  }),
  profile(3, "foreign-national-id", "Foreign national identity card", "FOREIGN_NATIONAL_ID", "HR", {
    evidence: ["DOC001614 pp1–2", "DOC006012 p1"],
    positiveMarkers: cues(/national identity card/, /islamic republic of pakistan/),
    fields: [
      holder,
      required(sensitive(ref("national_id_number", "Identity Number", "Identity No.", "National ID Number", "CNIC Number"))),
      fact("issuer_country", "PK", "Islamic Republic of Pakistan"),
      optionalAuthority(),
      birth,
      issue,
      expiry,
      txt("native_script_name", "نام", "Name in Urdu"),
      sensitive(txt("reverse_address", "Address")),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...credentialIdentity, "Verify the Pakistan issuer format and applicable card sides."],
    holds: ["Additional issuing countries and card classes need an independently reviewed original."],
  }),
  profile(4, "employee-photograph", "Employee photograph", "EMPLOYEE_PHOTO", "HR", {
    evidence: ["DOC005936 p1", "DOC001674 p1"],
    positiveMarkers: cues(/^\[verified standalone portrait\]$/m),
    fields: [
      required(sensitive(ref("verified_subject_reference", "Verified Subject Reference"))),
      date("photo_date", "source_date", "Photo Date", "Capture Date"),
    ],
    actionRequirements: ["Authorized subject association and verified image provenance."],
    holdReason: "Portrait source format is confirmed. The text-only prototype requires separately verified image and holder association.",
    holds: ["Image purpose requires visual review. A photograph, filename or folder cannot establish an employee identity."],
  }),
  profile(5, "uae-employment-entry", "UAE employment entry visa or entry permit", "VISA", "HR", {
    evidence: ["DOC005939 p1", "DOC005940 p1", "HR-U33 pp5–6"],
    positiveMarkers: cues(/\b(?:entry permit|evisa)\b|إذن دخول/, /^\s*employment\s*$|دخول[\s\S]{0,80}عمل/m, /U\.?A\.?E|United Arab Emirates|الإمارات العربية المتحدة/),
    fields: [
      holder,
      entryPermit,
      fact("issuer_country", "AE", "United Arab Emirates", "الإمارات العربية المتحدة", "U.A.E"),
      fact("credential_kind", "employment_entry", "Employment"),
      optionalAuthority(),
      uid,
      passportNumber,
      nationality,
      employmentRole,
      birth,
      sponsor,
      issuePlace,
      date("issue_date", "issued", "Date & Place of Issue", "Date of Issue"),
      date("entry_deadline", "entry_deadline", "You are permitted to enter UAE until the date", "Entry Deadline"),
      count("stay_duration_days", "Maximum Stay", "Duration of Stay"),
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: [...credentialIdentity, "Confirm the explicit employment entry purpose and the date role before any action."],
    holds: ["Residence-purpose entry is still entry evidence. The entry deadline, sponsor, stay and work permit are independent inputs."],
  }),
  profile(6, "uae-visit-entry", "UAE visit visa or visit entry permit", "VISA", "HR", {
    evidence: ["ID-N130 p1", "ID-N138 p1"],
    positiveMarkers: cues(/\b(?:entry permit|evisa)\b|إذن دخول/, /tourism\s*[-–:]\s*single|سياحة[\s\S]{0,75}سفرة|سفرة[\s\S]{0,75}سياحة/, /U\.?A\.?E|United Arab Emirates|الإمارات العربية المتحدة/),
    fields: [
      holder,
      entryPermit,
      fact("issuer_country", "AE", "United Arab Emirates", "الإمارات العربية المتحدة", "U.A.E"),
      fact("credential_kind", "visit_entry", "Tourism"),
      fact("entry_count_kind", "single", "Tourism - Single", "Tourism – Single", "سفرة"),
      optionalAuthority(),
      required(entryDeadline),
      count("stay_duration_days", "Maximum Stay", "Duration of Stay"),
      uid,
      passportNumber,
      nationality,
      sponsor,
      issuePlace,
      date("issue_date", "issued", "Date & Place of Issue", "Date of Issue"),
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: [...credentialIdentity, "Verify visit purpose, the deadline to enter and any separately printed maximum stay."],
    holds: ["UAE multiple-entry or other visit variants require their own original and date-role rules."],
  }),
  profile(7, "uae-residence-permit", "UAE residence permit", "RESIDENCE_VISA", "HR", {
    evidence: ["DOC004354 p1", "DOC004465 p1", "DOC005900 p1"],
    positiveMarkers: cues(/residence permit|^\s*residence\s*$|تصريح إقامة/m, /United Arab Emirates|U\.?A\.?E|الإمارات العربية المتحدة/),
    negativeMarkers: cues(/cancel residence|residence cancellation|إلغاء إقامة|^\s*entry permit\s*$/m, /state of qatar/),
    fields: [
      holder,
      required(ref("residence_reference", "Residence No", "Residence Number", "File No", "File No.", "رقم الإقامة")),
      fact("issuer_country", "AE", "United Arab Emirates", "الإمارات العربية المتحدة", "U.A.E"),
      optionalAuthority(),
      required(date("residence_expiry_date", "credential_expiry", "Residence Expiry", "Residence Expiry Date", "Expiry Date", "تاريخ انتهاء الإقامة")),
      date("residence_issue_date", "issued", "Residence Issue Date", "Issue Date", "تاريخ إصدار الإقامة"),
      uid,
      sponsor,
      employer,
      passportNumber,
      employmentRole,
      issuePlace,
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...credentialIdentity, "Verify the printed sponsor and the independent relationship before any company routing.", ...confirmedExpiry],
    holds: ["An employer label may differ from sponsor. Missing or illegible sponsor evidence holds sponsor-dependent actions."],
  }),
  profile(8, "uae-residence-cancellation", "UAE residence cancellation", "IMMIGRATION_CANCELLATION", "HR", {
    evidence: ["DOC004356 p1", "DOC004422 p1"],
    positiveMarkers: cues(/residence cancellation|cancel residence inside uae|إلغاء إقامة/),
    fields: [
      holder,
      required(ref("affected_residence_reference", "Residence No", "Residence No.", "File No", "File No.", "رقم الإقامة")),
      required(date("cancellation_effective_date", "cancellation_effective", "Cancel Date", "Date of Cancellation", "تاريخ الإلغاء")),
      txt("cancellation_status", "Status", "الوضعية"),
      txt("cancellation_reason", "Cancel Reason", "Cancellation Reason"),
      date("printing_date", "printed", "Printing Date", "تاريخ الطباعة"),
      date("grace_end_date", "grace_end", "Leave or Change Status By", "Must Leave or Change Status No Later Than"),
      transaction,
      uid,
      sponsor,
      employer,
      passportNumber,
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: ["Require an authoritative posted cancellation and exactly one matched residence credential before any status action."],
    holds: ["Affected residence file number, employer file number and any cancellation transaction reference have separate roles."],
  }),
  profile(9, "work-permit", "Work permit or labour card", "LABOUR_CARD", "HR", {
    evidence: ["DOC005808 p1", "DOC004537 p1", "DOC004339 p1"],
    positiveMarkers: cues(/electronic work permit information|electronic work permit|work permit no\.?|labou?r card|تصريح عمل إلكتروني/, /person code|personal no\.?|establishment|معلومات المنشأة/),
    negativeMarkers: cues(/work permit cancellation|إلغاء تصريح عمل|employment contract|job offer full work/),
    fields: [
      required(txt("holder_name", "Person Name", "Employee Name", "Name", "اسم الشخص")),
      required(employer),
      required(ref("work_permit_reference", "Work Permit No.", "Work Permit No", "Card Number", "رقم البطاقة")),
      txt("work_permit_reference_type", "Card Type", "Permit Type", "نوع البطاقة"),
      sensitive(ref("mohre_person_code", "Person Code", "Personal No", "Personal No.", "رقم الشخص")),
      employmentRole,
      passportNumber,
      transaction,
      date("permit_issued_on", "issued", "Card Issuance Date", "Permit Issue Date"),
      date("permit_expires_on", "credential_expiry", "Card Expiry Date", "Permit Expiry Date"),
      sensitive(date("passport_issue_date", "supporting_credential_issue", "Passport Issue Date")),
      sensitive(date("passport_expiry_date", "supporting_credential_expiry", "Passport Expiry Date")),
      typeForm,
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...credentialIdentity, "Verify issuer, employer, exact reference type and issue/authority status before relying on the permit.", ...confirmedExpiry],
    holds: ["Preserve card and passport date roles. A printout alone cannot show current authority status."],
  }),
  profile(10, "work-permit-cancellation", "Work permit or labour cancellation", "IMMIGRATION_CANCELLATION", "HR", {
    evidence: ["DOC004295 pp1–2", "DOC004613 pp1–3", "ID-N057 pp1–2"],
    positiveMarkers: cues(/work permit cancellation|إلغاء تصريح عمل/, /card (?:number|type)|بطاقة/),
    fields: [
      required(txt("holder_name", "Person Name", "Employee Name", "Name", "اسم الشخص")),
      required(employer),
      required(ref("affected_work_permit_reference", "Card Number", "Work Permit No.", "رقم البطاقة")),
      txt("affected_work_permit_kind", "Card Type", "نوع البطاقة"),
      transaction,
      typeForm,
      txt("cancellation_reason", "Reason for Cancellation"),
      date("form_date", "transaction_form_date", "Date", "Transaction Date"),
      date("printing_date", "printed", "Printing Date & Time", "Printing Date"),
      date("last_working_day", "last_working_day", "Last Working Day", "Last Working Date", "تاريخ اخر يوم عمل"),
      date("cancellation_effective_date", "cancellation_effective", "Effective Cancellation Date", "Cancellation Effective Date"),
      ref("related_residence_number", "Residency Number", "Residence Number"),
      passportNumber,
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: ["Authority-posted status and effective cancellation date, plus exactly one matched work credential, are required for a cancellation action."],
    holds: ["Source samples establish a submission form. A last working date, printed date, or related residence reference has no cancellation effect by itself."],
  }),
  profile(11, "foreign-visa", "Foreign visa", "FOREIGN_IMMIGRATION_CREDENTIAL", "HR", {
    evidence: ["DOC006025 p1 front/reverse (intake 1151)"],
    positiveMarkers: cues(/state of qatar/, /residency permit/, /residency type|نوع الإقامة/),
    negativeMarkers: cues(/^\s*(?:tourism visit|visit visa)\s*$/m),
    fields: [
      fact("issuer_country", "QA", "State of Qatar"), fact("credential_kind", "residence_permit", "Residency Permit"),
      required(txt("printed_title", "State of Qatar", "Residency Permit")),
      { ...required(txt("holder_name_printed_en", "Name")), side: "front" },
      { ...txt("holder_name_printed_ar", "الاسم"), side: "front" },
      { ...required(sensitive(ref("qatar_personal_id", "ID.No", "ID No."))), side: "front", valuePattern: "^\\d{11}$" },
      { ...required(ref("permit_card_serial", "Serial No", "Serial No.")), side: "reverse", valuePattern: "^\\d{8,24}$" },
      { ...required(date("permit_expiry_date", "credential_expiry", "Expiry")), side: "front" },
      { ...required(date("supporting_passport_expiry_date", "supporting_credential_expiry", "Passport Expiry")), side: "reverse" },
      { ...required(txt("residency_type_raw", "Residency Type")), side: "reverse", valuePattern: "^عمل$" },
      { ...fact("residency_type", "work", "عمل"), side: "reverse" },
      { ...txt("occupation_raw", "Occupation"), side: "front" },
      txt("issuing_authority_raw", "Ministry of Interior"),
      field("boolean", "holder_signature_present", ["Handwritten Holder Signature"]),
      { ...txt("printed_employer_ar", "Employer"), side: "reverse" },
      { ...sensitive(ref("supporting_passport_number", "Passport Number")), side: "reverse" },
      { ...birth, side: "front" }, nationality,
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...credentialIdentity, "Validate the separately paired front and reverse with the approved Qatar work-residency reader.", ...confirmedExpiry],
    holds: ["Qatar visit/entry/work variants beyond the verified residency layout require independent proof. No issue date or visa number is established for this original."],
  }),
  profile(12, "job-offer", "Job offer letter", "JOB_OFFER_LETTER", "HR", {
    evidence: ["DOC004418 pp1,3–4", "DOC005840 pp1–2"],
    positiveMarkers: cues(/^\s*(?:job offer full work|job offer letter|offer of employment)\b|عرض عمل/m),
    negativeMarkers: cues(/^\s*employment contract full work\b/m),
    fields: [
      required(txt("candidate_name", "Candidate Name", "Employee Name", "Second Party", "اسم العامل")),
      required(employer),
      required(employmentRole),
      ref("offer_reference", "Offer Reference", "Job Offer No.", "Offer No."),
      transaction,
      date("offer_date", "offer_issued", "Date of Offer", "Offer Date", "Date"),
      date("acceptance_deadline", "acceptance_deadline", "Valid Until", "Accept By", "Acceptance Deadline"),
      date("proposed_start_date", "proposed_start", "Proposed Joining Date", "Proposed Start Date"),
      signed,
      typeForm,
    ],
    actionRequirements: [...copyScope, "Record the offer and acceptance separately from contract execution and confirmed employment start."],
    holds: ["A signed offer, contract preview or proposed joining date remains offer evidence."],
  }),
  profile(13, "employment-contract", "Labour or employment contract", "EMPLOYMENT_CONTRACT", "HR", {
    evidence: ["DOC005839 pp1–2", "DOC005567 pp1–2", "HR-U33 pp7–8"],
    positiveMarkers: cues(/^\s*(?:employment contract(?: full work)?|labou?r contract)\b|عقد عمل/m, /first party|second party|transaction number|الطرف الأول|الطرف الثاني/),
    negativeMarkers: cues(/^\s*job offer full work\b/m),
    fields: [
      required(txt("employee_name", "Worker Name", "Employee Name", "Second Party", "اسم العامل")),
      required(employer),
      required(transaction),
      required(employmentRole),
      ref("related_offer_reference", "Job Offer No.", "Offer No"),
      date("offer_date", "offer_issued", "Offer Date", "Offer Dated"),
      date("contract_start_date", "contract_start", "Date of Commencement", "Effective Date", "Contract Start Date"),
      date("contract_end_date", "contract_end", "Contract End Date", "End of Contract"),
      signed,
      typeForm,
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: [...copyScope, "Require actual signatures or an authoritative execution state before a contract action."],
    holds: ["A preview format, title or signature label cannot establish execution. Contract end is not a credential expiry."],
  }),
  profile(14, "cv", "CV or résumé", "CV", "HR", {
    evidence: ["DOC005170 p1"],
    positiveMarkers: cues(/\bcurriculum vitae\b|\br[eé]sum[eé]\b|السيرة الذاتية|(?:skills|qualifications)[\s\S]{0,1500}work experience/, /work experience|employment history|education/),
    fields: [
      required(txt("candidate_name", "Candidate Name", "Name", "Full Name")),
      date("cv_date", "source_date", "CV Date", "Résumé Date"),
      txt("declared_experience", "Work Experience", "Employment History"),
      txt("declared_education", "Education", "Qualifications"),
      signed,
    ],
    actionRequirements: [...copyScope, "Treat statements in the original as candidate declarations and verify qualifications separately."],
    holds: ["A date inside a claimed credential does not date the CV."],
  }),
  profile(15, "academic-transcript", "Academic transcript", "ACADEMIC_TRANSCRIPT", "Education Degree", {
    evidence: ["DOC004382 pp1–2", "DOC004399 pp1–2 exact duplicate"],
    positiveMarkers: cues(/academic transcript/, /course description and grades|grade point average|academic registrar/),
    fields: [
      required(txt("learner_name", "Student Name", "Learner Name", "Name")),
      required(txt("institution", "Institution", "University", "College")),
      required(txt("programme", "Programme", "Program", "Course of Study")),
      sensitive(ref("student_reference", "Student No.", "Registration No.", "Student Number")),
      ref("transcript_reference", "Transcript Number", "Transcript No."),
      txt("academic_term", "Semester", "Academic Term", "Academic Year"),
      sensitive(txt("grade_point_average", "Cumulative Grade Point Average", "CGPA")),
      date("completion_date", "programme_completion", "Date of Completion"),
      issue,
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: ["Verify learner, institution, document purpose and provenance to file. Verify a degree award separately."],
    holds: ["Approved for the checked university transcript layout. Restrict academic marks and require separate source evidence for other layouts."],
  }),
  profile(16, "employee-introduction", "Employee introduction or security declaration form", "PERSONNEL_PERMIT_APPLICATION", "CICPA", {
    evidence: ["DOC004227 p1", "DOC004293 p1"],
    positiveMarkers: cues(/introduction statement/, /applicant details/),
    fields: [
      applicant,
      employer,
      sponsor,
      birth,
      txt("previous_nationality", "Previous Nationality"),
      txt("present_nationality", "Present Nationality"),
      txt("point_of_entry", "Point of Entry"),
      date("date_of_entry", "travel_entry", "Date of Entry to UAE"),
      passportNumber,
      sensitive(ref("quoted_visa_reference", "Visa No.", "Visa No")),
      sensitive(ref("quoted_emirates_id", "Emirates ID", "Emirates ID No.")),
      signed,
      typeForm,
    ],
    actionRequirements: ["Verify applicant, submission purpose and organization. Verify the actual grant separately before site entitlement use."],
    holds: ["Quoted identification and signature regions provide supporting evidence. The introduction form carries no independent entitlement."],
  }),
  profile(17, "no-objection-certificate", "No-objection certificate", "NOC", "Legal", {
    evidence: ["DOC005383 p1", "DOC006009 p1", "ID-N007 p1"],
    positiveMarkers: cues(/no objection certificates?|عدم ممانعة|ليس لدينا مانع/),
    fields: [
      employee,
      issuer,
      txt("recipient", "Recipient", "To", "السادة"),
      required(txt("permission_purpose", "Subject", "Purpose", "الموضوع")),
      date("issue_date", "issued", "Date", "Issue Date", "التاريخ"),
      date("valid_until", "permission_end", "Valid Until", "Valid To"),
      count("duration_months", "Validity Months", "Duration Months"),
      signed,
      txt("undertaking_clause", "Undertaking Clause", "Commitment"),
      txt("site_scope", "Site", "Work Site", "Location"),
    ],
    actionRequirements: ["Verify issuer, beneficiary, purpose, addressee and actual restrictions before relying on the permission."],
    holds: ["Keep combined undertaking clauses with the NOC. Verify the actual work/site permit independently."],
  }),
  profile(18, "undertaking-letter", "Undertaking letter", "UNDERTAKING_LETTER", "Legal", {
    evidence: ["ID-N007 p1", "DOC004424 p12", "DOC004457 p6", "DOC005191 p4"],
    positiveMarkers: cues(/^\s*(?:letter of undertaking|undertaking letter|خطاب تعهد|رسالة تعهد)\s*$/m),
    negativeMarkers: cues(/^\s*(?:declaration|no objection certificates?)\b/m),
    fields: [
      required(txt("responsible_party", "Responsible Party", "Issuer")),
      txt("recipient", "Recipient", "To"),
      required(txt("obligation", "Undertaking", "Obligation", "Commitment")),
      txt("scope", "Scope", "Work Site"),
      date("issue_date", "issued", "Issue Date", "Date"),
      signed,
    ],
    actionRequirements: ["Obtain the independent undertaking original or an approved combined-document indexing decision."],
    holdReason: "A site NOC contains an undertaking and insurer declarations reference a separate letter. The standalone issued specimen is missing.",
  }),
] as const;

function optionalAuthority(): Phase2FieldRule {
  return { ...authority, required: false };
}

const administrationProfiles = [
  profile(19, "salary-certificate", "Salary certificate", "SALARY_CERTIFICATE_AR", "General", {
    evidence: ["DOC004343 p1", "DOC004251 p1"],
    positiveMarkers: cues(/salary certificate|شهادة راتب/),
    negativeMarkers: cues(/basic plan|health insurance application|daman enrol/i),
    fields: [
      employee,
      required(employer),
      required(date("certificate_date", "issued", "Certificate Date", "Date", "التاريخ")),
      amount("basic_salary", "Basic Salary", "الراتب الأساسي"),
      amount("salary_allowances", "Allowance", "Allowances", "بدلات"),
      amount("total_salary", "Total Salary", "Monthly Salary", "إجمالي الراتب"),
      txt("currency", "Currency", "العملة"),
      txt("pay_basis", "Pay Basis", "Pay Period"),
      signed,
    ],
    actionRequirements: [...copyScope, "Verify printed pay basis and currency if the authorized action needs those values."],
    holds: ["Restrict pay fields and keep the certificate separate from payroll changes or insurance enrollment."],
  }),
  profile(20, "insurance-salary-declaration", "Salary declaration for insurance", "INSURANCE_SALARY_DECLARATION", "Insurance", {
    evidence: ["DOC004577 p11", "DOC004578 pp11–12,14", "DOC005026 body"],
    positiveMarkers: cues(/salary certificate|salary declaration|شهادة راتب/, /daman|national health insurance/, /basic plan|health insur|insurance application/),
    fields: [
      employee,
      required(txt("declarant", "Declarant", "Declared By", "Applicant Name")),
      employer,
      txt("insurer", "Insurer", "Insurance Provider"),
      txt("enrollment_purpose", "Application Purpose", "Plan"),
      required(date("declaration_date", "declaration_date", "Date of Declaration", "Date")),
      amount("monthly_salary", "Monthly Salary", "Salary"),
      txt("currency", "Currency"),
      txt("pay_basis", "Pay Basis", "Pay Period"),
      ref("application_reference", "Application No.", "Application Reference"),
      signed,
    ],
    actionRequirements: ["Verify declarant, subject, date and insurance enrollment purpose. Confirm coverage independently."],
    holds: ["Restricted income evidence. Employer supporting letter and first-person declaration have separate document roles."],
  }),
  profile(21, "payroll-bank-evidence", "Bank or payroll card evidence", "PAYROLL_BANK_EVIDENCE", "HR", {
    evidence: ["DOC005463 p1 (adjacent IBAN certificate)", "DOC005929 pp3,5 comparison"],
    positiveMarkers: cues(/payroll card|wage card|بطاقة الرواتب/),
    negativeMarkers: cues(/iban certificate|شهادة آيبان/),
    fields: [
      holder,
      issuer,
      required(sensitive(ref("masked_card_reference", "Masked Card Number", "Masked Payroll Card Number"))),
      txt("currency", "Currency"),
      expiry,
    ],
    actionRequirements: ["Verify issued evidence type, issuer and subject. Require a masked reference and established ERP controls for any payment destination change."],
    holdReason: "A payroll or wage card was not established in the reopened originals.",
    holds: ["The checked bank certificate belongs in IBAN_CERTIFICATE subject to authority and scope. Keep bank letters, IBAN certificates and payroll cards distinct."],
  }),
  profile(22, "leave-application", "Leave application", "HR_LEAVE_REQUEST", "HR", {
    evidence: ["DOC004390 p1", "DOC005270 p1"],
    positiveMarkers: cues(/leave application|طلب إجازة/, /annual leave|leave type|no\.? of days|نوع الإجازة/),
    negativeMarkers: cues(/sick leave certificate|شهادة إجازة مرضية/),
    fields: [
      employee,
      required(txt("leave_type", "Leave Type", "Type of Leave", "نوع الإجازة")),
      required(date("requested_start", "request_start", "Leave Start Date", "Leave From", "From")),
      required(date("requested_end", "request_end", "Leave End Date", "Leave To", "To")),
      date("joining_date", "joining_date", "Date of Joining"),
      date("request_date", "request_date", "Request Date", "Date"),
      date("expected_return", "expected_return", "Expected Return Date"),
      date("actual_return", "actual_return", "Actual Return Date"),
      count("requested_days", "No. of Days", "Number of Days"),
      txt("department", "Department"),
      signed,
      typeForm,
    ],
    actionRequirements: ["Verify employee, leave purpose and requested interval. Record authorized approval separately."],
    holds: ["Employee signature and joining dates do not establish leave approval or a requested leave start."],
  }),
  profile(23, "sick-leave-certificate", "Sick-leave certificate", "SICK_LEAVE_CERTIFICATE", "HR", {
    evidence: ["DOC004616 p1"],
    positiveMarkers: cues(/sick leave certificate|شهادة إجازة مرضية/, /sick leave period|مدة الإجازة/),
    fields: [
      required(sensitive(txt("patient_name", "Patient Name", "Name", "اسم المريض"))),
      required(txt("facility", "Medical Facility", "Facility Name", "Facility")),
      sensitive(certificate),
      required(date("certified_leave_start", "certified_leave_start", "Sick Leave From", "From")),
      required(date("certified_leave_end", "certified_leave_end", "Sick Leave To", "To")),
      issue,
      txt("physician", "Physician", "Doctor"),
      signed,
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: ["Verify facility, subject, certificate authenticity and the certified leave interval."],
    holds: ["Medical handling is restricted. Keep examination and certificate dates separate from the certified absence interval."],
  }),
  profile(24, "warning-letter", "Warning letter", "HR_WARNING_LETTER", "HR", {
    evidence: ["DOC004819 p1", "DOC004820 p1"],
    positiveMarkers: cues(/final warning letter|warning letter|إنذار نهائي/),
    fields: [
      employee,
      issuer,
      required(date("issue_date", "issued", "Date", "Issue Date", "التاريخ")),
      date("incident_date", "incident", "Incident Date", "Date of Incident"),
      txt("warning_level", "Warning Level", "Warning Type"),
      sensitive(txt("reported_action", "Subject", "Disciplinary Action")),
      signed,
    ],
    actionRequirements: ["Verify employee, issuing authority, event and stated action. Verify acknowledged status through source evidence."],
    holds: ["Restricted disciplinary evidence. Issued date, event date and acknowledgment are distinct."],
  }),
  profile(25, "asset-handover", "Asset handover form", "ASSET_CUSTODY_RECORD", "HR", {
    evidence: ["DOC004744 p1", "DOC005677 p1"],
    positiveMarkers: cues(/handing over|asset handover|تسليم عهدة/, /mobile phone|received by|condition/),
    negativeMarkers: cues(/vehicle handover agreement/),
    fields: [
      required(txt("custodian", "Received By", "Custodian", "Employee Name")),
      issuer,
      required(ref("asset_reference", "Asset Number", "Asset ID", "Serial No.", "IMEI")),
      required(date("handover_date", "handover", "Handover Date", "Date")),
      txt("item_description", "Item", "Mobile Phone", "Device Model"),
      txt("custody_action", "Action", "Handover Type"),
      txt("condition", "Condition"),
      date("return_date", "custody_return", "Return Date"),
      signed,
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: ["Check exact asset, custodian, action, acknowledgement and date within the owning scope."],
    holds: ["Retain evidence and hold an assignment if asset identification is missing or ambiguous."],
  }),
  profile(26, "vehicle-handover", "Vehicle handover agreement", "ASSET_CUSTODY_RECORD", "HR", {
    evidence: ["DOC004598 pp1–2", "DOC005678 pp1–2", "DOC004718 pp1–2,7–8"],
    positiveMarkers: cues(/vehicle handover agreement/, /vehicle registration|chassis/),
    fields: [
      required(txt("custodian", "Employee Name", "Received By", "Custodian")),
      required(employer),
      required(ref("vehicle_registration_reference", "Vehicle Registration Number", "Registration No", "Plate Number")),
      ref("chassis_number", "Chassis No", "Chassis Number"),
      txt("model", "Vehicle Make/Model", "Vehicle Model", "Model"),
      count("vehicle_year", "Vehicle Year", "Model Year"),
      count("odometer", "Odometer", "Odometer Reading"),
      required(date("handover_date", "handover", "Handover Date", "Date of Handover")),
      date("return_date", "custody_return", "Return Date"),
      txt("condition", "Condition", "Vehicle Condition"),
      signed,
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: ["Fleet verifies exact vehicle and company scope. Verify signed custody action, dated acknowledgment and parties."],
    holds: ["A registration reference quoted in the agreement and any attached licence/access/registration page each keep their own source role."],
  }),
  profile(27, "tenancy-address-evidence", "Tenancy or address evidence", "EJARI_CONTRACT", "HR", {
    evidence: ["DOC004257 p1 (Ejari)", "DOC004257 p2 (linked receipt)"],
    positiveMarkers: cues(/\bejari\b|إيجاري/, /tenancy contract|contract registration|عقد إيجار/),
    negativeMarkers: cues(/^\s*(?:payment receipt|receipt voucher)\b/m),
    fields: [
      required(txt("tenant_name", "Tenant Name", "Tenant", "المستأجر")),
      txt("owner_name", "Owner Name", "Landlord", "Owner"),
      required(ref("ejari_contract_number", "Contract No.", "Contract Number", "Ejari Number", "رقم العقد")),
      required(sensitive(txt("address", "Property Address", "Property", "Building Name", "العقار"))),
      date("registration_date", "tenancy_registered", "Registration Date", "Contract Registration Date"),
      required(date("tenancy_start", "tenancy_start", "Contract Start Date", "Start Date", "Tenancy Start")),
      required(date("tenancy_end", "tenancy_end", "Contract End Date", "End Date", "Tenancy End")),
      fact("issuer_country", "AE", "Ejari"),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: "tenancy_end",
    actionRequirements: ["Verify Dubai Land Department issuer, named tenant, address and reference. Verify the employee-to-tenant relationship before address use."],
    holds: ["Generic non-Ejari ADDRESS_EVIDENCE remains held. Linked registration receipt is a separate payment purpose."],
  }),
  profile(28, "payment-receipt", "Payment receipt", "PAYMENT_RECEIPT", "Finance", {
    evidence: ["DOC004248 p1", "DOC004257 p2", "DOC004420 pp1–2"],
    positiveMarkers: cues(/payment receipt|receipt voucher|سند قبض|transaction no.{0,80}paid/i),
    negativeMarkers: cues(/^\s*tax invoice\b|invoice amount due/m),
    fields: [
      issuer,
      required(ref("receipt_reference", "Receipt Number", "Receipt No.", "Receipt No", "Transaction No", "Transaction No.")),
      required(date("payment_date", "payment_date", "Payment Date", "Receipt Date", "Date")),
      txt("payer", "Received From", "Payer Name", "Payer"),
      amount("paid_amount", "Paid Amount", "Amount Paid", "Total Paid"),
      txt("currency", "Currency"),
      txt("payment_method", "Payment Method"),
      ref("related_case_reference", "Application Reference", "Policy Number"),
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: ["Verify issuer, receipt reference, payment date, and explicit paid/received evidence before using payment status."],
    holds: ["A fee due, invoice, pending transaction or request cannot substitute for payment proof."],
  }),
  profile(29, "tax-invoice", "Tax invoice", "INVOICE", "Finance", {
    evidence: ["DOC004254 p1", "DOC004243 p2"],
    positiveMarkers: cues(/tax invoice|فاتورة ضريبية/, /invoice (?:number|no\.?)|رقم الفاتورة/),
    fields: [
      issuer,
      required(ref("invoice_number", "Invoice Number", "Invoice No.", "Invoice No", "رقم الفاتورة")),
      required(date("invoice_date", "invoice_date", "Invoice Date", "Date", "تاريخ الفاتورة")),
      required(txt("counterparty", "Customer Name", "Customer", "Bill To", "Counterparty")),
      ref("issuer_tax_registration", "TRN", "Tax Registration Number"),
      amount("invoice_total", "Total Amount", "Invoice Total", "Total"),
      amount("tax_amount", "VAT", "Tax Amount", "VAT Amount"),
      txt("currency", "Currency"),
      ref("related_policy_reference", "Policy Number", "Policy No."),
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: ["Verify issuer, invoice reference/date, counterparty and purpose. Confirm tax and amount roles before using them."],
    holds: ["Paid status requires separate receipt evidence. Policy validity is independent of invoice date."],
  }),
  profile(30, "medical-fitness", "Medical fitness certificate or report", "OFFSHORE_ONSHORE_MEDICAL_REPORT", "HSE", {
    evidence: ["DOC004497 pp1–15", "DOC005367 pp1–14", "DOC005809 pp1–21"],
    positiveMarkers: cues(/medical fitness certificate|medical fitness assessment/, /new national medical cent(?:re|er)|top care medical cent(?:re|er)/),
    fields: [
      required(sensitive(txt("patient_name", "Patient Name", "Employee Name", "Name"))),
      required(txt("facility", "Facility Name", "Medical Facility", "Clinic")),
      sensitive(certificate),
      required(txt("assessment_scope", "Assessment Scope", "Assessment Purpose", "Work Scope")),
      required(sensitive(txt("selected_fitness_outcome", "Selected Fitness Outcome", "Signed Fitness Conclusion"))),
      sensitive({ ...txt("printed_fitness_selection", "Printed Fitness Selection"), sourceOnly: true }),
      sensitive(date("examination_date", "assessment_date", "Date of Examination", "Examination Date")),
      sensitive(date("certificate_date", "issued", "Certificate Date", "Issue Date", "Date")),
      sensitive(date("fitness_expiry_date", "credential_expiry", "Fitness Expiry", "Certificate Expiry")),
      sensitive(txt("authorized_restrictions", "Restrictions", "Authorized Restrictions")),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: ["Require verified exact selected/signed outcome and page or region. Keep the facility's report and supporting tests linked in one restricted packet.", ...confirmedExpiry],
    holds: ["Unselected form options and lab results cannot establish fitness. Top Care expiry is unproven. Date of examination and signed certificate date have separate roles."],
  }),
  profile(31, "health-insurance-membership-card", "Health insurance membership card", "MEDICAL_INSURANCE", "Insurance", {
    evidence: ["DOC004338 p1", "DOC004342 p1", "DOC005774 p1"],
    positiveMarkers: cues(/daman|health insurance|medical insurance/, /member card|membership card|approval no|card number|card no\.?|network/),
    negativeMarkers: cues(/certificate of coverage|insurance policy certificate|policy schedule|tax invoice/),
    fields: [
      member,
      required(txt("insurer", "Insurance Provider", "Insurer", "Provider")),
      required(sensitive(ref("member_card_number", "Member ID", "Membership Card No", "Card Number", "Card No."))),
      ref("related_policy_number", "Policy No.", "Policy Number"),
      ref("insurance_issue_number", "Issue Number", "Issue No"),
      ref("regulator_approval_number", "DOH Approval No"),
      txt("plan_network", "Plan", "Network"),
      date("member_effective_date", "member_coverage_start", "Member Effective Date", "Effective Date"),
      date("member_expiry_date", "coverage_end", "Member Expiry", "Card Expiry", "Expiry Date"),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: "coverage_end",
    actionRequirements: ["Verify insurer, member and true member/card reference. Confirm the relevant member coverage independently from policy renewal."],
    holds: ["Keep policy, member/card, issue and regulator approval numbers distinct."],
  }),
  profile(32, "health-insurance-coverage", "Health insurance coverage or policy evidence", "INSURANCE_CERTIFICATE", "Insurance", {
    evidence: ["DOC004336 p1", "DOC004903 p1", "DOC005195 p1"],
    positiveMarkers: cues(/certificate of coverage|health insurance policy|medical insurance certificate/, /policy (?:number|no\.?)|policyholder/),
    negativeMarkers: cues(/involuntary loss of employment|travel insurance|tax invoice/),
    fields: [
      required(txt("insurer", "Insurer", "Insurance Provider")),
      policy,
      required(txt("policy_subject", "Policyholder", "Policy Holder", "Group Name", "Policy Holder Name")),
      member,
      sponsor,
      txt("coverage_basis", "Coverage Basis", "Policy Type"),
      date("policy_start", "policy_coverage_start", "Policy Start Date", "Policy Effective Date"),
      date("policy_end", "policy_coverage_end", "Policy End Date", "Policy Expiry Date"),
      date("member_start", "member_coverage_start", "Member Effective Date"),
      date("member_end", "member_coverage_end", "Member Expiry", "Individual Expiry"),
      sensitive(ref("related_member_card_number", "Card No.", "Card Number")),
      txt("plan_network", "Plan", "Network"),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: "coverage_end",
    actionRequirements: ["Verify insurer, policy, basis and validated subject. For enrollment, independently verify the member-to-policy link and the member's coverage interval."],
    holds: ["Group and member coverage dates can differ. Determine the lifecycle subject before using any expiry."],
  }),
  profile(33, "iloe-certificate", "Involuntary Loss of Employment insurance certificate", "ILOE_CERTIFICATE", "Insurance", {
    evidence: ["DOC004243 pp1–2", "DOC005392 pp1–2"],
    positiveMarkers: cues(/involuntary loss of employment|\bILOE\b/, /insurance certificate number|coverage period/),
    negativeMarkers: cues(/^\s*tax invoice\b/m),
    fields: [
      member,
      required(txt("insurer", "Insurer", "Insurance Provider", "Insurance Pool")),
      required(ref("certificate_number", "Insurance Certificate Number", "Certificate No.")),
      required(coverageStart),
      required(coverageEnd),
      txt("insurance_category", "Insurance Category", "Category"),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: "coverage_end",
    actionRequirements: ["Verify issuer, insured subject, certificate and printed coverage interval."],
    holds: ["The premium and linked tax invoice have separate finance fields. They do not date the insurance certificate."],
  }),
  profile(34, "travel-insurance", "Travel insurance certificate", "INSURANCE_CERTIFICATE", "Insurance", {
    evidence: ["DOC004246 pp1–2", "DOC004822 p1"],
    positiveMarkers: cues(/travel insurance/, /certificate of insurance|policy (?:number|no\.?|period)/),
    negativeMarkers: cues(/^\s*(?:tax invoice|payment receipt)\b/m),
    fields: [
      member,
      required(txt("insurer", "Insurer", "Insurance Provider", "Issued By")),
      policy,
      txt("policyholder", "Policy Holder", "Policyholder"),
      required(coverageStart),
      required(coverageEnd),
      date("policy_issue_date", "issued", "Policy Issue Date", "Issue Date"),
      date("trip_start_date", "trip_start", "Trip Start Date", "Departure Date"),
      date("trip_end_date", "trip_end", "Trip End Date", "Return Date"),
      required(txt("territorial_scope", "Area of Cover", "Territory", "Geographical Scope")),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: "coverage_end",
    actionRequirements: ["Confirm insured person, issuer, policy reference, travel interval and territorial scope."],
    holds: ["The policyholder can differ from an insured person. Verify coverage dates and trip dates independently."],
  }),
] as const;

const learnerReference = sensitive(ref("learner_reference", "Learner Number", "Learner Reference", "Learner No."));
const awardedExpiry = date("expiry_date", "credential_expiry", "Expiry Date", "Date of Expiry", "Certificate Expiry Date");
const trainingValidity = count("printed_validity_duration", "Validity Period", "Valid For", "Validity");
const licenceReference = required(ref("licence_number", "License No.", "Licence No.", "LICENCE NUMBER", "License Number", "رقم الرخصة"));
const licenceClass = required(txt("licence_class", "Licence Class", "License Class", "Class", "الفئة"));
const drivingLicenceFields = [
  holder, authority, licenceReference, licenceClass,
  required(txt("issuer_country", "Issuing Country", "Country of Issue")),
  date("licence_issue_date", "issued", "Issue Date", "Date of Issue"),
  date("licence_first_issue_date", "first_issue", "First Issue", "First Issued"),
  required(date("licence_expiry_date", "credential_expiry", "Validity", "Expiry Date", "Date of Expiry")),
  issuePlace, ref("traffic_code", "Traffic Code", "Traffic File Number"),
  txt("licence_restrictions", "Restrictions"), employmentRole,
];

function cicpaFields(scope: "onshore" | "offshore", scopeLabel: string): readonly Phase2FieldRule[] {
  return [
    fact("access_scope", scope, scopeLabel),
    fact("issuing_authority", "National Guard", "National Guard", "الحرس الوطني"),
    fact("printed_permit_strip", scopeLabel, scopeLabel),
    holder, required(ref("pass_number", "Pass Number", "Permit No.", "رقم التصريح")),
    required(txt("company_name", "Sponsor", "Company Name", "الشركة")), required(expiry), nationality, employmentRole,
    { ...required(sensitive(txt("cicpa_locations_arabic", "Authorized Locations Arabic", "المواقع المصرح بها", "الأماكن المصرح بها"))), multiline: true },
    required(ref("company_registration_number", "Company Registration Number", "Company Number", "الرقم")),
  ];
}

const trainingProfiles = [
  profile(35, "h2s-training", "H2S training certificate", "H2S_TRAINING_CERTIFICATE", "HSE", {
    evidence: ["DOC004232 p1 (ADNOC Level 2)"],
    positiveMarkers: cues(/H\s*[2₂]\s*S training level\s*2/, /certificate of completion|has attended and completed/, /ADNOC technical academy/),
    fields: [
      participant,
      fact("provider", "ADNOC Technical Academy", "ADNOC Technical Academy"),
      fact("course_title", "H2S Training Level 2", "H2S Training Level 2"),
      fact("printed_outcome", "completed", "Has attended and completed", "Certificate of Completion"),
      required(certificate),
      required(issue),
      required(awardedExpiry),
      learnerReference,
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...courseScope, ...confirmedExpiry],
    holds: ["ADNOC H2S Level 2 and OPITO Basic H2S are separate variants. Equivalence requires approval."],
  }),
  profile(36, "fire-safety-certificate", "Fire safety certificate", "TRAINING_AWARD", "HSE", {
    evidence: ["HR-U11 p1", "HR-U12 p1", "DOC004230 p1 comparison"],
    positiveMarkers: cues(/level\s*2 international award in fire safety/, /highfield/, /successfully passed an assessment/),
    fields: [
      participant,
      provider,
      fact("course_title", "Level 2 International Award in Fire Safety", "Level 2 International Award in Fire Safety"),
      fact("printed_outcome", "passed_assessment", "Successfully passed an assessment"),
      fact("awarding_body", "Highfield", "Highfield"),
      required(certificate),
      required(awardDate),
      awardedExpiry,
      txt("course_director", "Course Director"),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...courseScope, ...confirmedExpiry],
    holds: ["Provider attendance and awarding-body assessment evidence keep their own outcomes. Require separate proof of expiry where absent."],
  }),
  profile(37, "firefighting-training", "Firefighting training certificate or card", "TRAINING_AWARD", "HSE", {
    evidence: ["DOC000031 p1", "DOC000060 p1"],
    positiveMarkers: cues(/basic fire\s*fighting/, /successfully completed|certificate of completion/),
    fields: [
      participant,
      provider,
      fact("course_title", "Basic Fire Fighting", "Basic Fire Fighting"),
      fact("printed_outcome", "completed", "Successfully completed", "Certificate of Completion"),
      certificate,
      trainingCourseDate,
      awardedExpiry,
      trainingValidity,
      txt("trainer", "Trainer"),
      txt("temporary_status", "Temporary Status", "Certificate Status"),
      signed,
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...courseScope, ...confirmedExpiry],
    holds: ["Keep printed validity period and printed expiry separate. Verify card formats and additional levels independently."],
  }),
  profile(38, "fire-watcher-training", "Fire Watcher training card", "TRAINING_AWARD", "HSE", {
    evidence: ["DOC000375 p1"],
    positiveMarkers: cues(/\bfire\s*watcher\b/, /certificate (?:no|issue date|expiry date)|successfully completed/),
    fields: [...awardFields, awardedExpiry, ref("work_order_reference", "Work Order No.")],
    actionRequirements: courseScope,
    holdReason: "The original image does not reliably establish the full Fire Watcher title and scope.",
    holds: ["Fire Warden equivalence requires explicit approved proof."],
  }),
  profile(39, "first-aid-aed-cpr", "First Aid, AED and CPR certificate", "TRAINING_AWARD", "HSE", {
    evidence: ["DOC004231 p1", "DOC004500 p1 attendance comparison"],
    positiveMarkers: cues(/international emergency first aid[\s\S]{0,30}AED[\s\S]{0,15}CPR/, /has successfully completed|has successfully passed/),
    negativeMarkers: cues(/does not (?:document|constitute|certify).{0,40}(?:successful completion|certification)/),
    fields: [
      participant,
      provider,
      fact("course_title", "Highfield International Emergency First Aid, AED & CPR", "International Emergency First Aid, AED & CPR"),
      fact("printed_outcome", "completed", "Has successfully completed"),
      txt("award_level", "Award Level", "Level"),
      certificate,
      trainingCourseDate,
      awardedExpiry,
      ref("provider_licence", "Licence No.", "License No."),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...courseScope, ...confirmedExpiry],
    holds: ["A class notice or noncompletion attendance record belongs in training activity. Verify awarding-body status separately from provider wording."],
  }),
  profile(40, "onshore-induction", "Onshore induction certificate", "ADNOC_INDUCTION", "HSE", {
    evidence: ["DOC004235 p1", "DOC000541 p1"],
    positiveMarkers: cues(/onshore induction/, /ADNOC life saving rules/, /certificate of completion|has attended and completed/),
    fields: [
      participant,
      provider,
      fact("training_scope", "onshore", "Onshore Induction"),
      fact("course_title", "Onshore Induction + ADNOC Life Saving Rules", "Onshore Induction + ADNOC Life Saving Rules"),
      fact("printed_outcome", "completed", "Has attended and completed", "Certificate of Completion"),
      required(certificate),
      required(issue),
      required(awardedExpiry),
      inductionCourseDate,
    ],
    tags: ["SITE_ONSHORE"], duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...courseScope, ...confirmedExpiry],
    holds: ["An induction credential needs separate permission evidence for site access."],
  }),
  profile(41, "offshore-induction", "Offshore induction certificate", "ADNOC_INDUCTION", "HSE", {
    evidence: ["DOC004502 p1", "DOC004867 p1", "HR-U08 p1"],
    positiveMarkers: cues(/offshore induction[\s\S]{0,45}ADNOC life saving rules|ADNOC offshore HSE induction/, /certificate of completion|has (?:attended and completed|completed)/),
    negativeMarkers: cues(/tropical basic offshore safety induction|T[\s-]?BOSIET/),
    fields: [
      participant,
      provider,
      course,
      fact("training_scope", "offshore", "Offshore Induction"),
      fact("printed_outcome", "completed", "Has completed", "Certificate of Completion"),
      required(certificate),
      required(issue),
      required(awardedExpiry),
      inductionCourseDate,
      ref("provider_licence", "Licence No.", "License No."),
    ],
    tags: ["SITE_OFFSHORE"], duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...courseScope, ...confirmedExpiry],
    holds: ["Client induction, emergency response qualification and attendance-only activity are independent."],
  }),
  profile(42, "t-bosiet", "Tropical Basic Offshore Safety Induction and Emergency Training certificate", "ADNOC_OPITO", "HSE", {
    evidence: ["DOC005032 p1", "DOC005431 p1"],
    positiveMarkers: cues(/tropical basic offshore safety induction and emergency training|T[\s-]?BOSIET/, /OPITO/, /awarded on|assessed/),
    fields: [
      participant,
      provider,
      fact("course_title", "Tropical Basic Offshore Safety Induction and Emergency Training", "Tropical Basic Offshore Safety Induction and Emergency Training", "T-BOSIET"),
      fact("awarding_body", "OPITO", "OPITO"),
      outcome,
      required(certificate),
      required(awardDate),
      required(awardedExpiry),
      learnerReference,
      txt("standard_variant", "Standard Variant", "OPITO Standard"),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...courseScope, ...confirmedExpiry],
    holds: ["Printed course components need independent award evidence before filing as standalone qualifications."],
  }),
  profile(43, "other-safety-training", "Other safety training certificate", "TRAINING_AWARD", "HSE", {
    evidence: ["DOC004380 p1"],
    positiveMarkers: cues(/IOSH managing safely/, /successful completion|certificate number/),
    fields: [
      participant,
      provider,
      fact("course_title", "IOSH Managing Safely", "IOSH Managing Safely"),
      fact("awarding_body", "IOSH", "IOSH"),
      outcome,
      required(ref("certificate_number", "IOSH Certificate Number", "Certificate Number")),
      date("issue_date", "issued", "Issued Date", "Date of Issue"),
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: courseScope,
    holds: ["Only the checked IOSH award is represented. Introduce other awards individually with printed outcome and reviewed aliases."],
  }),
  profile(44, "hse-safety-passport", "HSE or safety passport", "ADNOC_PASSPORT", "HSE", {
    evidence: ["DOC004480 p1", "DOC005916 p1", "DOC000353 p1"],
    positiveMarkers: cues(/safety passport|HSE passport/, /issuing location|passport number/),
    fields: [
      holder,
      issuer,
      ref("safety_passport_id", "Safety Passport ID", "Safety Passport Number"),
      sensitive(ref("supporting_passport_number", "Passport Number")),
      issuePlace,
      employmentRole,
      date("passport_expiry_date", "credential_expiry", "Expiry Date"),
      { ...txt("offshore_expiry_printed", "Offshore Expiry Date"), sourceOnly: true },
      { ...txt("onshore_expiry_printed", "Onshore Expiry Date"), sourceOnly: true },
      txt("listed_endorsement", "Endorsement", "Endorsed Course"),
    ],
    actionRequirements: ["Verify the actual safety passport, holder and confirmed authority. Review each personal endorsement and validity separately."],
    holdReason: "The checked safety passport presentation does not establish a personally endorsed qualification or an authority-to-act credential.",
    holds: ["ADNOC_ATA routing requires an independently verified authority layout."],
  }),
  profile(45, "training-attendance", "Training attendance or participation record", "TRAINING_ACTIVITY", "HSE", {
    evidence: ["DOC004865 p1", "DOC004500 p1", "HR-U14 p1"],
    positiveMarkers: cues(/class attendance|certificate of attendance|attendance certificate|attendance only|certificate of participation/),
    negativeMarkers: cues(/has (?:successfully completed|successfully passed|attended and completed)/),
    fields: [
      participant,
      provider,
      course,
      ref("attendance_reference", "Attendance Reference", "Certificate Number"),
      required(date("activity_date", "attendance_date", "Class Date", "Course Date", "Attendance Date")),
      txt("attendance_status", "Attendance Status", "Participation Status"),
      date("printed_activity_valid_until", "attendance_evidence_valid_until", "Valid Until"),
    ],
    actionRequirements: ["Verify participant, provider, class and attendance evidence. Preserve all course entries the same notice contains."],
    holds: ["Attendance and successful completion require their own evidence and routes."],
  }),
  profile(46, "training-booking", "Training registration or booking", "TRAINING_ACTIVITY", "HSE", {
    evidence: ["DOC002855 p1 (rotated)", "DOC002855 pp2–3 supporting"],
    positiveMarkers: cues(/training registration|training booking|course registration|booking confirmation|course duration[\s\S]{0,500}attendance signature/, /course|training/),
    fields: [
      participant,
      provider,
      course,
      ref("booking_reference", "Booking Reference", "Registration No.", "Session Reference"),
      date("scheduled_start", "scheduled_start", "Scheduled Start Date", "Course Start Date"),
      date("scheduled_end", "scheduled_end", "Scheduled End Date", "Course End Date"),
      txt("booking_status", "Booking Status", "Registration Status"),
      txt("course_location", "Training Location", "Location"),
      ref("related_receipt", "Receipt No.", "Payment Reference"),
    ],
    actionRequirements: ["Verify actual submission/booking evidence, course and participant. Mark planned and attended outcomes independently."],
    holds: ["Uncompleted session and assessment columns are form fields only."],
  }),
  profile(47, "government-driving-licence", "Government driving licence", "DRIVING_LICENSE", "HR", {
    evidence: ["DOC004236 p1 (UAE)", "HR-U20 p3 (UAE)", "HR-U27 p1 (Saudi)", "DOC004782 p1 (Saudi)", "DOC004530 p1 (Qatar)", "DOC004991 p1 (Kuwait)", "DOC005524 p1 (Oman)", "DOC005525 p1 (Oman)"],
    positiveMarkers: cues(/driving licen[cs]e|رخصة القيادة/, /licen[cs]e (?:no\.?|number)|traffic code|رقم الرخصة|royal oman police/),
    negativeMarkers: cues(/certificate of completion|defensive driving certificate/),
    fields: drivingLicenceFields,
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...credentialIdentity, "Verify issuing authority, calendar, exact licence class and relevant side of the original before entitlement use.", ...confirmedExpiry],
    holds: ["Qatar front does not prove class. Kuwait Profession is not a class. Pair Saudi fragments and do not assume regional class equivalence or a calendar conversion."],
  }),
  profile(48, "defensive-driving", "Defensive driving certificate or card", "TRAINING_AWARD", "HSE", {
    evidence: ["DOC004325 p1", "DOC004435 p1", "DOC004437 p1", "DOC004498 p1"],
    positiveMarkers: cues(/defensive driving/, /qualification number|certificate (?:number|no\.?)|successfully completed/),
    fields: [
      ...awardFields,
      awardedExpiry,
      trainingValidity,
      ref("qualification_number", "Qualification Number"),
      txt("training_vehicle_class", "Training Vehicle Class", "Vehicle Category", "Training Class"),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...courseScope, ...confirmedExpiry],
    holds: ["A defensive-driving award does not establish government driving licence class. Use printed validity and expiry separately."],
  }),
  profile(49, "driving-school-training", "Driving school training certificate", "ADSD", "HSE", {
    evidence: ["DOC004456 p1", "DOC004653 p1", "DOC004722 p1", "DOC005060 p1", "DOC004483 p1", "DOC005358 p1"],
    positiveMarkers: cues(/driving school training|ADSD/, /training|certificate/),
    fields: [
      ...awardFields,
      awardedExpiry,
      trainingValidity,
      txt("school_name", "School Name", "Driving School"),
      txt("training_vehicle_class", "Training Vehicle Class", "Vehicle Category"),
    ],
    actionRequirements: courseScope,
    holdReason: "Training completion sources were verified, but the school relationship and ADSD provider/profile were not established.",
    holds: ["Route a separately verified industry training award according to its own exact title, provider and result."],
  }),
  profile(50, "equipment-competency", "Equipment operator or driver competency certificate/card", "EQUIPMENT_COMPETENCY", "HSE", {
    evidence: ["DOC004510 p1", "DOC005086 p1", "DOC005265 p1 comparison", "DOC005266 p1 comparison", "DOC005222 p1 comparison", "DOC005345 p1 comparison", "DOC005710 p1 comparison", "DOC004720 p1 comparison"],
    positiveMarkers: cues(/test equipment type|level achieved/, /successfully passed|assessment result|theoretical[\s\S]{0,120}practical/),
    fields: [
      participant,
      provider,
      required(txt("equipment_type", "Test Equipment Type", "Equipment Type")),
      required(txt("assessment_result", "Results", "Result", "Level Achieved", "Assessment Result")),
      txt("test_location", "Location of Test", "Test Location"),
      txt("assessor", "Assessor", "Trainer"),
      txt("theoretical_result", "Theoretical"),
      txt("practical_result", "Practical"),
      txt("restrictions", "Restrictions", "Limitations"),
      certificate,
      date("assessment_date", "assessment_date", "Assessment Date", "Test Date"),
      issue,
      awardedExpiry,
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: ["Verify positive assessment, exact equipment class, scope and conditions. Confirm separately before an operational entitlement.", ...confirmedExpiry],
    holds: ["Course completion for excavator, forklift, backhoe loader, crane, roller or trailer driver is training evidence unless the actual assessment is printed and verified."],
  }),
  profile(51, "cicpa-onshore", "CICPA Onshore Personnel Pass", "CICPA_PASS", "CICPA", {
    evidence: ["HR-U02 p1 front/reverse", "HR-U03 p1 front/reverse", "HR-U04 p1 comparison", "HR-U20 p4"],
    positiveMarkers: cues(/National Guard|الحرس الوطني/, /تصريح\s+دخول\s+بري|onshore personnel pass/),
    negativeMarkers: cues(/تصريح\s+دخول\s+بحري|security permit application|application form for persons security permit/),
    fields: cicpaFields("onshore", "تصريح دخول بري"),
    tags: ["SITE_ONSHORE"], duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: ["Verify both sides, exact printed scope strip, sponsor, pass number, printed expiry and the complete raw Arabic locations before applying access. Verify controlled site mapping separately.", ...confirmedExpiry],
    holds: ["Capture Arabic lines, slashes, wraps, qualifications and جميع as printed. Hold partial location OCR, uncertain sides and unproved scope. Issue-date label is unproven."],
  }),
  profile(52, "cicpa-offshore", "CICPA Offshore Personnel Pass", "CICPA_PASS", "CICPA", {
    evidence: ["HR-U09 p1 front/reverse", "HR-U15 p1 front/reverse", "HR-U22 p1 front/reverse", "HR-U07 p1 comparison"],
    positiveMarkers: cues(/National Guard|الحرس الوطني/, /تصريح\s+دخول\s+بحري|offshore personnel pass/),
    negativeMarkers: cues(/تصريح\s+دخول\s+بري|security permit application|application form for persons security permit/),
    fields: cicpaFields("offshore", "تصريح دخول بحري"),
    tags: ["SITE_OFFSHORE"], duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: ["Read the verified offshore strip, both sides, scope, sponsor and expiry. Capture complete raw Arabic sites before verifying the controlled site mapping.", ...confirmedExpiry],
    holds: ["Group or explicit lists vary by pass. Preserve Arabic qualifiers, line layout and slashes. Color and related onshore wording do not establish entitlement."],
  }),
  profile(53, "personnel-security-permit-application", "Personnel security permit application", "PERSONNEL_PERMIT_APPLICATION", "CICPA", {
    evidence: ["DOC004249 p1", "DOC004258 p1", "DOC005558 p1"],
    positiveMarkers: cues(/application form for persons security permit|personnel security permit application|طلب تصريح أمني/),
    fields: [
      applicant,
      sponsor,
      employer,
      passportNumber,
      employmentRole,
      birth,
      ref("application_reference", "Application No.", "Application Reference", "رقم الطلب"),
      date("submission_date", "submission_date", "Submission Date", "Application Date"),
      txt("requested_scope", "Requested Locations", "Requested Areas", "Requested Scope"),
      ref("quoted_existing_permit_reference", "Permit No.", "Permit Number"),
      date("quoted_existing_permit_expiry", "supporting_credential_expiry", "Permit Expiry", "Expiry Date"),
      typeForm,
    ],
    actionRequirements: ["Verify applicant, sponsor and actual requested scope as application evidence. A grant must be verified separately."],
    holds: ["An expiry on this form can describe a quoted existing or attached permit. Preserve request and grant roles."],
  }),
  profile(54, "site-access-card", "Site access card", "SITE_ACCESS_PERMIT", "HSE", {
    evidence: ["DOC005239 p1"],
    positiveMarkers: cues(/^\s*(?:GATE PASS|SITE ACCESS CARD)\b/m),
    fields: [
      holder,
      issuer,
      required(ref("gate_pass_reference", "Gate Pass No.", "Pass Number", "Permit Number")),
      required(txt("access_scope", "Authorized Areas", "Site", "Allowed Locations")),
      expiry,
      employer,
      employmentRole,
    ],
    actionRequirements: ["Verify issuing organization, site, reference, exact allowed area and expiry or issue state before entitlement use."],
    holdReason: "Gate-pass purpose is visible. Issuer, reference, validity and allowed scope are unproven.",
    holds: ["ADNOC_GATE_PASS route requires confirmed issuer and site mapping. Printed Operator Heavy Equipment is a job role."],
  }),
  profile(55, "rfid-credential", "RFID credential/card", "RFID_CREDENTIAL", "HSE", {
    evidence: ["DOC000381 p1", "DOC000459 p1", "DOC000508 p1", "DOC000566 p1"],
    positiveMarkers: cues(/\bRFID\b|radio frequency identification/, /id number|card number|issue date/),
    fields: [
      holder,
      issuer,
      required(sensitive(ref("credential_reference", "ID Number", "Card Number", "RFID Number"))),
      required(txt("credential_purpose", "RFID Purpose", "Credential Purpose")),
      issue,
      expiry,
      txt("assigned_asset", "Asset Reference", "Vehicle Number"),
      txt("access_scope", "Access Scope", "Authorized Site"),
    ],
    actionRequirements: ["Verify issuer, true card purpose, person or asset assignment, system and authoritative entitlement before workflow use."],
    holdReason: "Checked cards show names, ID numbers and issue dates. RFID purpose and operational entitlement remain unproven.",
    holds: ["Expiry and access scope require their own evidence."],
  }),
  profile(56, "vehicle-access-registration-support", "Vehicle access permit or registration evidence attached to an HR custody file", "VEHICLE_REGISTRATION", "Fleet", {
    evidence: ["DOC005059 pp1–2", "DOC005059 p10", "DOC005059 pp3–9,11 supporting"],
    positiveMarkers: cues(/vehicle access permit|vehicle registration(?: card| certificate)|vehicle gate pass/),
    fields: [
      issuer,
      required(ref("vehicle_reference", "Vehicle Registration Number", "Plate Number", "Vehicle ID")),
      ref("chassis_reference", "Chassis No.", "Chassis Number"),
      required(ref("credential_reference", "Permit Number", "Registration Reference")),
      txt("vehicle_model", "Vehicle Model"),
      txt("access_scope", "Authorized Site", "Allowed Area"),
      issue,
      expiry,
    ],
    actionRequirements: ["Confirm standalone credential, actual vehicle, issuer/site, permission scope and applicable validity. Route through authorized Fleet or Site Access policy."],
    holdReason: "The source packet establishes a vehicle custody reference and a separate access page. Registration filing and access fields require clearer originals.",
    holds: ["A registration number quoted in an agreement is supporting evidence only. SITE_ACCESS_PERMIT requires independent verification."],
  }),
] as const;

const passportIssuerLayouts = [
  { code: "IN", country: "India", evidence: "HR-U33 pp2–3", marker: /Republic of India|भारत गणराज्य|P\s*<\s*IND/, labels: ["Republic of India", "भारत गणराज्य", "P<IND", "P< IND"] },
  { code: "PK", country: "Pakistan", evidence: "DOC004429 pp1–2", marker: /Islamic Republic of Pakistan|P\s*<\s*PAK/, labels: ["Islamic Republic of Pakistan", "P<PAK", "P< PAK"] },
  { code: "JO", country: "Jordan", evidence: "DOC001255 p1", marker: /Hashemite Kingdom of Jordan|المملكة الأردنية الهاشمية|P\s*<\s*JOR/, labels: ["Hashemite Kingdom of Jordan", "المملكة الأردنية الهاشمية", "P<JOR", "P< JOR"] },
  { code: "PS", country: "Palestine", evidence: "DOC001587 p1", marker: /State of Palestine|Palestinian Authority|P\s*<\s*PSE/, labels: ["State of Palestine", "Palestinian Authority", "P<PSE", "P< PSE"] },
  { code: "SY", country: "Syria", evidence: "DOC001599 p1", marker: /Syrian Arab Republic|الجمهورية العربية السورية|P\s*<\s*SYR/, labels: ["Syrian Arab Republic", "الجمهورية العربية السورية", "P<SYR", "P< SYR"] },
  { code: "GH", country: "Ghana", evidence: "DOC001116 p1", marker: /Republic of Ghana|P\s*<\s*GHA/, labels: ["Republic of Ghana", "P<GHA", "P< GHA"] },
  { code: "NG", country: "Nigeria", evidence: "DOC000686 p1", marker: /Federal Republic of Nigeria|P\s*<\s*NGA/, labels: ["Federal Republic of Nigeria", "P<NGA", "P< NGA"] },
  { code: "NP", country: "Nepal", evidence: "DOC000750 p1", marker: /Government of Nepal|P\s*<\s*NPL/, labels: ["Government of Nepal", "P<NPL", "P< NPL"] },
  { code: "KE", country: "Kenya", evidence: "DOC000364 p1", marker: /Republic of Kenya|P\s*<\s*KEN/, labels: ["Republic of Kenya", "P<KEN", "P< KEN"] },
  { code: "DE", country: "Germany", evidence: "DOC001021 p1", marker: /Federal Republic of Germany|Bundesrepublik Deutschland|P\s*<\s*D<</, labels: ["Federal Republic of Germany", "Bundesrepublik Deutschland", "P<D<<"] },
  { code: "UG", country: "Uganda", evidence: "DOC000351 p1", marker: /Republic of Uganda|P\s*<\s*UGA/, labels: ["Republic of Uganda", "P<UGA", "P< UGA"] },
];

const passportBase = identityProfiles[0];
const passportVariants = passportIssuerLayouts.map(({ code, country, evidence, marker, labels }) =>
  profile(1, "passport-" + code.toLowerCase(), country + " passport", passportBase.typeCode, passportBase.category, {
    evidence: [evidence],
    positiveMarkers: [...passportBase.positiveMarkers, marker.source],
    negativeMarkers: passportBase.negativeMarkers,
    fields: passportBase.fields.map((rule) => rule.key === "issuer_country" ? fact("issuer_country", code, ...labels) : rule),
    duplicatePolicy: passportBase.duplicatePolicy,
    renewalPolicy: passportBase.renewalPolicy,
    actionRequirements: passportBase.actionRequirements,
    holds: passportBase.holds,
  }),
);

const variants = [
  ...passportVariants,
  profile(11, "foreign-visa-sa-tourism", "Saudi Arabia tourism visit visa", "FOREIGN_IMMIGRATION_CREDENTIAL", "HR", {
    evidence: ["DOC004252 p1", "DOC004311 p1"],
    positiveMarkers: cues(/Saudi Embassy|المملكة العربية السعودية/, /tourism\s*visit|زيارة سياحة/, /visa\s*(?:no\.?|number)/),
    fields: [
      holder, fact("issuer_country", "SA", "Saudi Embassy"), fact("credential_kind", "visit_visa", "Tourism Visit"),
      required(ref("visa_number", "Visa No.", "Visa Number", "رقم التأشيرة")), ref("visa_application_number", "Application No.", "Application Number"),
      date("visa_issue_date", "issued", "Date of Issue", "Issue Date"),
      required(entryDeadline), count("stay_duration_days", "Duration of Stay", "Maximum Stay"),
      txt("entry_count_kind", "Entry Type", "Number of Entries"), issuePlace, passportNumber,
      date("supporting_uae_residence_expiry", "supporting_credential_expiry", "UAE Residence Expiry Date"),
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: ["Verify issuer, document purpose, visa number and holder. Keep visit deadline, stay and supporting credential expiry independent."],
    holds: ["The observed layout prints multiple entry. Confirm explicit entry wording for each document."],
  }),
  profile(21, "bank-iban-certificate", "IBAN Certificate", "IBAN_CERTIFICATE", "HR", {
    evidence: ["DOC005463 p1"],
    positiveMarkers: cues(/IBAN certificate|شهادة آيبان/, /reference no\.?|IBAN number|رقم آيبان/),
    fields: [
      required(txt("account_holder", "Account Holder", "Account Holder Name", "Account Name")),
      issuer,
      required(ref("certificate_reference", "Reference No", "Reference No.", "Reference Number")),
      issue,
      sensitive(ref("masked_iban", "Masked IBAN", "Masked IBAN Number")),
    ],
    duplicatePolicy: fingerprintAndIdentity,
    actionRequirements: ["Verify issuer, certificate reference and subject. Use established controls for any payment destination change."],
    holds: ["Keep account numbers and unmasked IBAN out of Phase 2 review proposals. A bank-issued certificate is not a payroll card."],
  }),
  profile(35, "h2s-training-opito-basic", "OPITO Basic H2S Training certificate", "ADNOC_OPITO", "HSE", {
    evidence: ["DOC004501 p1"],
    positiveMarkers: cues(/basic H\s*[2₂]\s*S training/, /OPITO/, /awarded on|assessed/),
    fields: [
      participant,
      provider,
      fact("course_title", "Basic H2S Training", "Basic H2S Training"),
      fact("awarding_body", "OPITO", "OPITO"),
      outcome,
      required(certificate),
      learnerReference,
      required(awardDate),
      required(awardedExpiry),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...courseScope, ...confirmedExpiry],
    holds: ["OPITO Basic H2S and ADNOC Level 2 are distinct qualifications."],
  }),
  profile(39, "basic-first-aid-training", "Basic First Aid completion certificate", "TRAINING_AWARD", "HSE", {
    evidence: ["DOC004669 p1", "DOC005308 p1"],
    positiveMarkers: cues(/^Course\s*:\s*Basic First Aid\s*$/, /^Name\s*:.*This is to certify that/, /Has successfully Completed/, /Issued Date|Valid Till/),
    negativeMarkers: cues(/does not (?:document|constitute|certify).{0,40}(?:successful completion|certification)/),
    fields: [
      participant,
      provider,
      fact("course_title", "Basic First Aid", "Basic First Aid"),
      fact("printed_outcome", "completed", "Has successfully completed"),
      certificate,
      issue,
      date("expiry_date", "credential_expiry", "Valid Till", "Expiry Date"),
      txt("trainer", "Instructor Name", "Trainer"),
      txt("temporary_status", "Temporary Status", "Certificate Status"),
    ],
    duplicatePolicy: fingerprintAndIdentity, renewalPolicy: credentialExpiry,
    actionRequirements: [...courseScope, ...confirmedExpiry],
    holds: ["The printed Basic First Aid title provides no independent evidence of AED, CPR, or another awarding body's qualification."],
  }),
] as const;

const exceptionRules: readonly Phase2ExceptionRule[] = [
  { id: "exact-copy", owner: "DMS", disposition: "reconcile", requirements: ["Match trusted content fingerprints within authorized scope.", "Retain both source paths and history. Report a duplicate skip only after reconciliation confirms the existing record."] },
  { id: "possible-credential-copy", owner: "DMS", disposition: "review", requirements: ["For different bytes, compare issuer, holder, reference role and value, type, layout and relevant dates.", "Link outcome only after authorized reconciliation and read-back."] },
  { id: "supporting-page", owner: "DMS", disposition: "hold", requirements: ["Find the exact related credential using printed evidence.", "Keep secondary biodata, reverse pages and quoted references attached to their source purpose."] },
  { id: "mixed-packet", owner: "DMS", disposition: "hold", requirements: ["Keep page-level evidence and source history.", "Separate distinct documents only with authority. Keep a verified medical certificate and its supporting tests together."] },
  { id: "subject-or-scope-conflict", owner: "HR", disposition: "hold", requirements: ["Verify exact employee or authorized entity and company/branch scope.", "Preserve source evidence and check the existing approval route."] },
  { id: "missing-or-conflicting-field", owner: "DMS", disposition: "hold", requirements: ["Record labelled evidence and explicit unknown, unclear or inapplicable state.", "A missing action-required field blocks the relevant action."] },
  { id: "renewal-candidate", owner: "DMS", disposition: "review", requirements: ["Use applicable verified expiry role and exact authorized credential.", "Record a new outcome and verified predecessor link before supersession."] },
  { id: "qualification-or-access-conflict", owner: "HSE", disposition: "hold", requirements: ["Verify issuer, course, selected outcome, scope and actual entitlement.", "Apply approved equivalence and controlled sites only."] },
  { id: "payment-or-invoice-conflict", owner: "Finance", disposition: "review", requirements: ["Verify payer/payee, invoice amount/date roles and separate receipt evidence."] },
  { id: "vehicle-or-custody-conflict", owner: "Fleet", disposition: "hold", requirements: ["Verify asset identity, authority and exact custody or permit effect."] },
];

export const PHASE2_CATALOG = {
  version: "phase2-hr.1.2.1",
  profiles: [...identityProfiles, ...administrationProfiles, ...trainingProfiles],
  variants,
  exceptionRules,
  controlledTags: ["SITE_ONSHORE", "SITE_OFFSHORE"],
  legacyTypeAliases: {
    LABOR_CARD_AR: "LABOUR_CARD",
    LABOR_CONTRACT_AR: "EMPLOYMENT_CONTRACT",
  },
  legacyFieldAliases: {
    "transaction_number ": "transaction_number",
    issuing_country: "issuer_country",
  },
} as const;
