/** Printable proposals from the owner-supplied revision file, 30 October 2026.
 * No business approval is implied. Confirmation v2 is deliberately excluded. */
export const proposedHrWording:Record<string,{en:string[];ar:string[]}>= {
  "HR_EMPLOYMENT_LETTER": {
    "en": [
      "EMPLOYMENT CERTIFICATE",
      "TO WHOM IT MAY CONCERN",
      "This is to certify that {{employee_name_en}} (Employee No. {{employee_no}}) has been employed by {{company_name_en}} since {{joining_date}} and currently holds the position of {{job_title_en}}.",
      "This certificate is issued at the employee's request for official purposes.",
      "For and on behalf of {{company_name_en}}"
    ],
    "ar": [
      "شهادة عمل",
      "إلى من يهمه الأمر",
      "تشهد {{company_name_ar}} بأن السيد/السيدة {{employee_name_ar}} (الرقم الوظيفي: {{employee_no}}) يعمل/تعمل لديها منذ تاريخ {{joining_date}}، ويشغل/تشغل حالياً وظيفة {{job_title_ar}}.",
      "وقد صدرت هذه الشهادة بناءً على طلب الموظف/الموظفة لتقديمها إلى الجهات المعنية.",
      "عن {{company_name_ar}}"
    ]
  },
  "HR_EXPERIENCE_LETTER": {
    "en": [
      "CERTIFICATE OF EMPLOYMENT AND SERVICE",
      "TO WHOM IT MAY CONCERN",
      "This is to certify that {{employee_name_en}}, Employee No. {{employee_no}}, was employed by {{company_name_en}} from {{joining_date}} to {{end_date}}, for a total service period of {{service_period}}. The employee's last position was {{job_title_en}} [or: principal work performed: {{work_performed}}].",
      "The employee's last wage was AED {{last_wage}} [state wage definition as verified]. The recorded reason for the end of employment was {{verified_termination_reason}}.",
      "This certificate is issued at the employee's request as a record of employment and service.",
      "For and on behalf of {{company_name_en}}"
    ],
    "ar": [
      "شهادة خبرة وخدمة",
      "إلى من يهمه الأمر",
      "تشهد {{company_name_ar}} بأن {{employee_name_ar}}، الرقم الوظيفي {{employee_no}}، قد عمل/عملت لديها من {{joining_date}} حتى {{end_date}}، لمدة خدمة إجمالية قدرها {{service_period_ar}}، وكانت آخر وظيفة شغلها/شغلتها {{job_title_ar}} [أو: طبيعة العمل {{work_performed_ar}}].",
      "وقد بلغ الأجر الأخير {{last_wage_ar}}، وكان سبب انتهاء علاقة العمل المسجل والمعتمد هو {{verified_termination_reason_ar}}.",
      "صدرت هذه الشهادة بناءً على طلب الموظف/الموظفة لإثبات مدة الخدمة وبياناتها.",
      "عن {{company_name_ar}}"
    ]
  },
  "HR_SALARY_CERT_WITH_AMOUNT": {
    "en": [
      "SALARY CERTIFICATE",
      "To: {{recipient_name_en}}",
      "This is to certify that {{employee_name_en}} has been employed by {{company_name_en}} since {{joining_date}} and currently holds the position of {{job_title_en}}.",
      "As of {{issue_date}}, the employee's verified gross monthly salary is AED {{gross_monthly_salary}} ({{salary_in_words_en}}).",
      "This certificate is issued at the employee's request for {{purpose_en}} and does not constitute a guarantee of any personal loan or credit facility.",
      "For and on behalf of {{company_name_en}}"
    ],
    "ar": [
      "شهادة راتب",
      "إلى: {{recipient_name_ar}}",
      "تشهد {{company_name_ar}} بأن {{employee_name_ar}} يعمل/تعمل لديها منذ {{joining_date}} ويشغل/تشغل حالياً وظيفة {{job_title_ar}}.",
      "يبلغ إجمالي الراتب الشهري المعتمد بتاريخ {{issue_date}} مبلغ {{gross_monthly_salary_ar}} ({{salary_in_words_ar}}).",
      "وقد صدرت هذه الشهادة بناءً على طلب الموظف/الموظفة لغرض {{purpose_ar}}، ولا تُعد ضماناً لأي قرض شخصي أو تسهيل ائتماني.",
      "عن {{company_name_ar}}"
    ]
  },
  "HR_SALARY_CERT_GENERAL": {
    "en": [
      "EMPLOYMENT CERTIFICATE — WITHOUT SALARY INFORMATION",
      "TO WHOM IT MAY CONCERN",
      "This is to confirm that {{employee_name_en}} is currently employed by {{company_name_en}} as {{job_title_en}}, having joined the Company on {{joining_date}}.",
      "This certificate is issued at the employee's request for official purposes.",
      "For and on behalf of {{company_name_en}}"
    ],
    "ar": [
      "شهادة إثبات عمل دون بيان الراتب",
      "إلى من يهمه الأمر",
      "تشهد {{company_name_ar}} بأن {{employee_name_ar}} يعمل/تعمل لديها حالياً بوظيفة {{job_title_ar}} منذ تاريخ {{joining_date}}.",
      "وقد صدرت هذه الشهادة بناءً على طلب الموظف/الموظفة لتقديمها إلى الجهات المعنية.",
      "عن {{company_name_ar}}"
    ]
  },
  "HR_NOC": {
    "en": [
      "NO OBJECTION CERTIFICATE",
      "To: {{recipient_name_en}}",
      "{{company_name_en}} confirms that {{employee_name_en}}, Employee No. {{employee_no}}, is currently employed as {{job_title_en}}.",
      "The Company has no objection to the employee {{specific_approved_activity_en}}, subject to {{approved_conditions_en}} [omit if none].",
      "This certificate is issued solely for the purpose stated above and is valid until {{valid_until}}. It does not replace any external permit or approval required by the competent authority.",
      "For and on behalf of {{company_name_en}}"
    ],
    "ar": [
      "شهادة عدم ممانعة",
      "إلى: {{recipient_name_ar}}",
      "تؤكد {{company_name_ar}} أن {{employee_name_ar}} يعمل/تعمل لديها حالياً بوظيفة {{job_title_ar}}، الرقم الوظيفي {{employee_no}}.",
      "ولا تمانع الشركة في قيام الموظف/الموظفة بـ {{specific_approved_activity_ar}}، وذلك وفق الشروط المعتمدة {{approved_conditions_ar}} [تحذف العبارة عند عدم وجود شروط].",
      "صدرت هذه الشهادة للغرض الموضح أعلاه فقط، وتسري حتى تاريخ {{valid_until}}، ولا تحل محل أي تصريح أو موافقة مطلوبة من الجهات المختصة.",
      "عن {{company_name_ar}}"
    ]
  },
  "HR_WARNING_LETTER": {
    "en": [
      "FORMAL WRITTEN WARNING",
      "To: {{employee_name_en}}",
      "Subject: Formal Warning — {{warning_subject_en}}",
      "Following the review of the incident dated {{incident_date}}, management has determined that {{verified_conduct_description_en}}, contrary to {{policy_reference_en}}.",
      "You are required to {{specific_corrective_action_en}} by {{corrective_deadline}} and to comply with the Company's applicable policies and instructions.",
      "Any further action will be determined in accordance with applicable law and the Company's approved disciplinary procedures. You may submit a written response to Human Resources through {{response_channel_en}} within {{response_period}}, where applicable.",
      "Please acknowledge receipt below. Acknowledgment confirms receipt only and does not imply agreement with the warning.",
      "For and on behalf of {{company_name_en}}",
      "Employee receipt acknowledgment: Name / signature / date",
      "Authorised signatory: Name / title / signature / date"
    ],
    "ar": [
      "إنذار خطي رسمي",
      "إلى: {{employee_name_ar}}",
      "الموضوع: إنذار خطي بشأن {{warning_subject_ar}}",
      "بالإشارة إلى مراجعة الواقعة المؤرخة في {{incident_date}}، ثبت وفق الإجراءات المعتمدة {{verified_conduct_description_ar}}، بالمخالفة لـ {{policy_reference_ar}}.",
      "يتعين عليكم {{specific_corrective_action_ar}} في موعد أقصاه {{corrective_deadline}}، والالتزام بالسياسات والتعليمات المعمول بها في الشركة.",
      "وتُتخذ أي إجراءات لاحقة وفقاً للتشريعات السارية والإجراءات التأديبية المعتمدة لدى الشركة. ويحق لكم تقديم رد خطي إلى الموارد البشرية عبر {{response_channel_ar}} خلال {{response_period_ar}}، حيثما ينطبق.",
      "يرجى التوقيع بما يفيد الاستلام فقط، ولا يُعد التوقيع موافقة على مضمون الإنذار.",
      "عن {{company_name_ar}}",
      "إقرار بالاستلام: الاسم / التوقيع / التاريخ",
      "المفوّض بالتوقيع: الاسم / الصفة / التوقيع / التاريخ"
    ]
  },
  "HR_CLEARANCE_FORM": {
    "en": [
      "EMPLOYEE CLEARANCE FORM",
      "Employee: {{employee_name_en}} | No.: {{employee_no}} | Department: {{department_en}} | Last working date: {{last_working_date}}",
      "Each department must review the employee's outstanding responsibilities, returnable assets and applicable records, then record its decision below. This form is complete only after all required department reviews and final HR authorization."
    ],
    "ar": [
      "نموذج إخلاء طرف الموظف",
      "اسم الموظف: {{employee_name_ar}} | الرقم الوظيفي: {{employee_no}} | الإدارة: {{department_ar}} | آخر يوم عمل: {{last_working_date}}",
      "يتعين على كل جهة مختصة مراجعة الالتزامات والعهد والسجلات المتعلقة بالموظف وتوثيق نتيجة مراجعتها أدناه. ولا يُعد هذا النموذج مكتملاً إلا بعد استيفاء جميع الاعتمادات المطلوبة وموافقة إدارة الموارد البشرية النهائية."
    ]
  },
  "HR_JOINING_CHECKLIST": {
    "en": [
      "EMPLOYEE JOINING CHECKLIST",
      "Employee: {{employee_name_en}} | No.: {{employee_no}} | Joining date: {{joining_date}}",
      "The responsible department shall complete and verify each applicable joining requirement and record supporting evidence before marking the item complete."
    ],
    "ar": [
      "قائمة استكمال إجراءات الالتحاق بالعمل",
      "الموظف: {{employee_name_ar}} | الرقم الوظيفي: {{employee_no}} | تاريخ المباشرة: {{joining_date}}",
      "تتولى الجهة المسؤولة استكمال كل متطلب واجب التطبيق والتحقق منه وتسجيل المستند أو الدليل المؤيد قبل اعتماد حالة الإنجاز."
    ]
  },
  "HR_PPE_ISSUE_FORM": {
    "en": [
      "PERSONAL PROTECTIVE EQUIPMENT (PPE) ISSUE RECORD",
      "Employee: {{employee_name_en}} | Employee No.: {{employee_no}} | Issue date: {{issue_date}}",
      "The equipment listed below has been issued to the named employee in the quantities and condition recorded. The employee acknowledges receipt of the recorded items and may note any discrepancies below."
    ],
    "ar": [
      "نموذج تسليم معدات الوقاية الشخصية",
      "الموظف: {{employee_name_ar}} | الرقم الوظيفي: {{employee_no}} | تاريخ التسليم: {{issue_date}}",
      "تم تسليم معدات الوقاية الشخصية المبينة أدناه إلى الموظف وفق الكميات والحالة المدونة. ويقر الموظف باستلام البنود المسجلة، مع إثبات أي ملاحظات أو اختلافات أدناه."
    ]
  },
  "HR_BANK_SALARY_TRANSFER": {
    "en": [
      "BANK SALARY INFORMATION LETTER",
      "To: {{bank_name_en}}",
      "At the request of {{employee_name_en}}, Employee No. {{employee_no}}, {{company_name_en}} confirms the following verified employment and payroll particulars as of {{issue_date}}:",
      "- Position: {{job_title_en}}",
      "- Gross monthly salary: AED {{gross_monthly_salary}}",
      "- Salary account / IBAN (if authorised for disclosure): {{verified_iban}}",
      "This letter provides information only. It does not confirm a completed payment, guarantee credit, or constitute an irrevocable undertaking to transfer future salaries.",
      "For and on behalf of {{company_name_en}}"
    ],
    "ar": [
      "خطاب تأكيد بيانات الراتب للبنك",
      "إلى: {{bank_name_ar}}",
      "بناءً على طلب {{employee_name_ar}}، الرقم الوظيفي {{employee_no}}، تؤكد {{company_name_ar}} بيانات العمل والراتب المعتمدة التالية حتى تاريخ {{issue_date}}:",
      "- المسمى الوظيفي: {{job_title_ar}}",
      "- إجمالي الراتب الشهري: {{gross_monthly_salary_ar}}",
      "- حساب الراتب / رقم الآيبان (إذا صُرّح بالإفصاح عنه): {{verified_iban}}",
      "هذا الخطاب لتأكيد البيانات فقط، ولا يُعد إثباتاً لإتمام تحويل مالي أو ضماناً ائتمانياً أو تعهداً غير قابل للإلغاء بتحويل الرواتب مستقبلاً.",
      "عن {{company_name_ar}}"
    ]
  },
  "HR_EMBASSY_LETTER": {
    "en": [
      "EMPLOYMENT CONFIRMATION FOR EMBASSY / CONSULATE",
      "To: {{embassy_or_consulate_name_en}}",
      "Subject: Employment Confirmation — {{employee_name_en}}",
      "We confirm that {{employee_name_en}} has been employed by {{company_name_en}} since {{joining_date}} and currently holds the position of {{job_title_en}}.",
      "This letter is issued at the employee's request in support of {{application_purpose_en}}. [Optional, only if verified and authorised: approved leave dates {{leave_dates}} / monthly salary {{verified_salary}}.]",
      "For and on behalf of {{company_name_en}}"
    ],
    "ar": [
      "خطاب إثبات عمل للسفارة أو القنصلية",
      "إلى: {{embassy_or_consulate_name_ar}}",
      "الموضوع: إثبات عمل — {{employee_name_ar}}",
      "نفيدكم بأن {{employee_name_ar}} يعمل/تعمل لدى {{company_name_ar}} منذ تاريخ {{joining_date}}، ويشغل/تشغل حالياً وظيفة {{job_title_ar}}.",
      "وقد صدر هذا الخطاب بناءً على طلب الموظف/الموظفة لدعم {{application_purpose_ar}}. [تدرج بيانات الإجازة أو الراتب فقط إذا كانت مطلوبة ومعتمدة.]",
      "عن {{company_name_ar}}"
    ]
  },
  "HR_HANDOVER_FORM": {
    "en": [
      "EMPLOYEE HANDOVER FORM",
      "Handing-over employee: {{employee_name_en}} | No.: {{employee_no}}",
      "Receiving employee: {{receiving_employee_name_en}} | Department: {{department_en}}",
      "This form records the duties, documents, equipment, access items and unresolved matters actually handed over, subject to verification by the respective responsible owners."
    ],
    "ar": [
      "نموذج تسليم المهام والعهد",
      "الموظف المسلِّم: {{employee_name_ar}} | الرقم الوظيفي: {{employee_no}}",
      "الموظف المستلِم: {{receiving_employee_name_ar}} | الإدارة: {{department_ar}}",
      "يثبت هذا النموذج المهام والمستندات والمعدات ووسائل الدخول والأعمال المعلقة التي جرى تسليمها فعلياً، وفقاً لاعتماد الجهات المسؤولة عن كل بند."
    ]
  },
  "HR_LEAVE_CONFIRMATION": {
    "en": [
      "LEAVE CONFIRMATION LETTER",
      "To: {{employee_name_en}}",
      "This letter confirms that your {{leave_type_en}} leave has been approved under reference {{leave_request_ref}} for the period from {{leave_start_date}} to {{leave_end_date}}. Your scheduled return-to-work date is {{return_date}}.",
      "Any proposed change to these dates must be submitted through the Company's approved leave procedure.",
      "For and on behalf of {{company_name_en}}"
    ],
    "ar": [
      "خطاب تأكيد الإجازة",
      "إلى: {{employee_name_ar}}",
      "نؤكد اعتماد إجازتكم من نوع {{leave_type_ar}} بموجب الطلب رقم {{leave_request_ref}}، وذلك من تاريخ {{leave_start_date}} حتى {{leave_end_date}}، على أن يكون تاريخ العودة المقرر للعمل {{return_date}}.",
      "ويجب تقديم أي طلب لتعديل هذه المواعيد وفق إجراءات الإجازات المعتمدة في الشركة.",
      "عن {{company_name_ar}}"
    ]
  }
};
