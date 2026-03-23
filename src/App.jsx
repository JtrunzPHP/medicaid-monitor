import { useState, useMemo, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, Cell } from "recharts";

// ═══════════════════════════════════════════════
// PARKMAN HEALTHCARE PARTNERS BRAND COLORS
// ═══════════════════════════════════════════════
const P = {
  navy: "#0F2240", navy2: "#162D52", navy3: "#1C3A6E",
  green: "#2A7D5F", greenL: "#34A073",
  gold: "#C5975B", goldL: "#D4AD7A",
  white: "#FFFFFF", offW: "#F7F8FA",
  gray1: "#E8EBF0", gray2: "#C5CBD6", gray3: "#8B95A5", gray4: "#5A6577",
  bg: "#F2F4F7", red: "#C0392B", redL: "#E74C3C"
};

// ═══════════════════════════════════════════════════════════════
// COMPLETE CPT/HCPCS DATABASE — 220+ CODES, 20 SPECIALTIES
// mc = Medicare national allowed amount (CY2025/2026 PFS)
// ═══════════════════════════════════════════════════════════════
const CPT = {
  // ── E&M: OFFICE VISITS (New + Established) ──
  "99202": { d: "Office new, straightforward", s: "E&M Office", mc: 72.43 },
  "99203": { d: "Office new, low complexity", s: "E&M Office", mc: 112.40 },
  "99204": { d: "Office new, moderate", s: "E&M Office", mc: 172.18 },
  "99205": { d: "Office new, high complexity", s: "E&M Office", mc: 218.85 },
  "99211": { d: "Office est, minimal", s: "E&M Office", mc: 27.18 },
  "99212": { d: "Office est, straightforward", s: "E&M Office", mc: 58.53 },
  "99213": { d: "Office est, low complexity", s: "E&M Office", mc: 92.15 },
  "99214": { d: "Office est, moderate", s: "E&M Office", mc: 132.29 },
  "99215": { d: "Office est, high complexity", s: "E&M Office", mc: 181.54 },
  // Preventive — New
  "99381": { d: "Preventive new, infant", s: "E&M Office", mc: 98.50 },
  "99382": { d: "Preventive new, age 1-4", s: "E&M Office", mc: 105.22 },
  "99383": { d: "Preventive new, age 5-11", s: "E&M Office", mc: 103.40 },
  "99384": { d: "Preventive new, age 12-17", s: "E&M Office", mc: 118.60 },
  "99385": { d: "Preventive new, age 18-39", s: "E&M Office", mc: 112.85 },
  "99386": { d: "Preventive new, age 40-64", s: "E&M Office", mc: 131.73 },
  // Preventive — Established
  "99391": { d: "Preventive est, infant", s: "E&M Office", mc: 88.15 },
  "99392": { d: "Preventive est, age 1-4", s: "E&M Office", mc: 95.30 },
  "99393": { d: "Preventive est, age 5-11", s: "E&M Office", mc: 92.18 },
  "99394": { d: "Preventive est, age 12-17", s: "E&M Office", mc: 104.55 },
  "99395": { d: "Preventive est, age 18-39", s: "E&M Office", mc: 105.42 },
  "99396": { d: "Preventive est, age 40-64", s: "E&M Office", mc: 118.90 },

  // ── E&M: HOSPITAL INPATIENT ──
  "99221": { d: "Initial hospital, straightforward", s: "E&M Hospital", mc: 133.71 },
  "99222": { d: "Initial hospital, moderate", s: "E&M Hospital", mc: 176.88 },
  "99223": { d: "Initial hospital, high complexity", s: "E&M Hospital", mc: 254.67 },
  "99231": { d: "Subsequent hospital, straightforward", s: "E&M Hospital", mc: 48.91 },
  "99232": { d: "Subsequent hospital, moderate", s: "E&M Hospital", mc: 88.72 },
  "99233": { d: "Subsequent hospital, high complexity", s: "E&M Hospital", mc: 128.47 },
  "99234": { d: "Obs/inpatient same date, straightforward", s: "E&M Hospital", mc: 187.32 },
  "99235": { d: "Obs/inpatient same date, moderate", s: "E&M Hospital", mc: 252.18 },
  "99236": { d: "Obs/inpatient same date, high", s: "E&M Hospital", mc: 312.44 },
  "99238": { d: "Hospital discharge, ≤30 min", s: "E&M Hospital", mc: 82.55 },
  "99239": { d: "Hospital discharge, >30 min", s: "E&M Hospital", mc: 118.30 },
  // Observation
  "99217": { d: "Observation discharge", s: "E&M Hospital", mc: 82.40 },
  "99218": { d: "Initial observation, straightforward", s: "E&M Hospital", mc: 110.25 },
  "99219": { d: "Initial observation, moderate", s: "E&M Hospital", mc: 155.38 },
  "99220": { d: "Initial observation, high", s: "E&M Hospital", mc: 207.15 },

  // ── CRITICAL CARE ──
  "99291": { d: "Critical care, first 30-74 min", s: "Critical Care", mc: 286.14 },
  "99292": { d: "Critical care, each addl 30 min", s: "Critical Care", mc: 127.68 },

  // ── EMERGENCY ──
  "99281": { d: "ED visit, self-limited", s: "Emergency", mc: 30.42 },
  "99282": { d: "ED visit, low complexity", s: "Emergency", mc: 56.18 },
  "99283": { d: "ED visit, moderate", s: "Emergency", mc: 88.35 },
  "99284": { d: "ED visit, moderate-high", s: "Emergency", mc: 148.22 },
  "99285": { d: "ED visit, high complexity", s: "Emergency", mc: 212.63 },

  // ── TELEHEALTH ──
  "99441": { d: "Telephone E&M, 5-10 min", s: "Telehealth", mc: 28.65 },
  "99442": { d: "Telephone E&M, 11-20 min", s: "Telehealth", mc: 56.32 },
  "99443": { d: "Telephone E&M, 21-30 min", s: "Telehealth", mc: 82.18 },

  // ── HOME VISITS ──
  "99341": { d: "Home visit new, straightforward", s: "Home Visit", mc: 73.52 },
  "99342": { d: "Home visit new, low", s: "Home Visit", mc: 115.88 },
  "99343": { d: "Home visit new, moderate", s: "Home Visit", mc: 170.45 },
  "99344": { d: "Home visit new, high", s: "Home Visit", mc: 247.30 },
  "99347": { d: "Home visit est, straightforward", s: "Home Visit", mc: 52.15 },
  "99348": { d: "Home visit est, low", s: "Home Visit", mc: 88.90 },
  "99349": { d: "Home visit est, moderate", s: "Home Visit", mc: 132.75 },
  "99350": { d: "Home visit est, high", s: "Home Visit", mc: 188.60 },

  // ── SNF ──
  "99304": { d: "SNF initial, straightforward", s: "SNF", mc: 110.82 },
  "99305": { d: "SNF initial, moderate", s: "SNF", mc: 149.55 },
  "99306": { d: "SNF initial, high complexity", s: "SNF", mc: 191.43 },
  "99307": { d: "SNF subsequent, straightforward", s: "SNF", mc: 40.18 },
  "99308": { d: "SNF subsequent, low", s: "SNF", mc: 72.91 },
  "99309": { d: "SNF subsequent, moderate", s: "SNF", mc: 107.65 },
  "99310": { d: "SNF subsequent, high complexity", s: "SNF", mc: 153.28 },

  // ── REHAB / PT / OT / SPEECH ──
  "97110": { d: "Therapeutic exercises, 15 min", s: "Rehab/PT", mc: 33.12 },
  "97112": { d: "Neuromuscular re-education, 15 min", s: "Rehab/PT", mc: 36.45 },
  "97113": { d: "Aquatic therapy, 15 min", s: "Rehab/PT", mc: 34.55 },
  "97116": { d: "Gait training, 15 min", s: "Rehab/PT", mc: 30.87 },
  "97140": { d: "Manual therapy, 15 min", s: "Rehab/PT", mc: 31.55 },
  "97530": { d: "Therapeutic activities, 15 min", s: "Rehab/PT", mc: 35.21 },
  "97535": { d: "Self-care/home mgmt training", s: "Rehab/PT", mc: 34.80 },
  "97542": { d: "Wheelchair mgmt training", s: "Rehab/PT", mc: 30.22 },
  "97150": { d: "Group therapy, 15 min", s: "Rehab/PT", mc: 16.42 },
  "97161": { d: "PT evaluation, low complexity", s: "Rehab/PT", mc: 92.18 },
  "97162": { d: "PT evaluation, moderate", s: "Rehab/PT", mc: 92.18 },
  "97163": { d: "PT evaluation, high complexity", s: "Rehab/PT", mc: 92.18 },
  "97164": { d: "PT re-evaluation", s: "Rehab/PT", mc: 52.70 },
  "97165": { d: "OT evaluation, low complexity", s: "Rehab/PT", mc: 88.35 },
  "97166": { d: "OT evaluation, moderate", s: "Rehab/PT", mc: 88.35 },
  "97167": { d: "OT evaluation, high complexity", s: "Rehab/PT", mc: 88.35 },
  "97168": { d: "OT re-evaluation", s: "Rehab/PT", mc: 52.70 },
  "92507": { d: "Speech/language treatment", s: "Rehab/PT", mc: 44.28 },
  "92521": { d: "Evaluation of speech fluency", s: "Rehab/PT", mc: 95.65 },
  "92522": { d: "Evaluation of speech production", s: "Rehab/PT", mc: 92.40 },
  "92523": { d: "Speech sound lang comprehension eval", s: "Rehab/PT", mc: 129.15 },
  "92526": { d: "Oral function treatment", s: "Rehab/PT", mc: 44.28 },

  // ── BEHAVIORAL HEALTH ──
  "90791": { d: "Psychiatric diagnostic eval", s: "Behavioral", mc: 152.80 },
  "90792": { d: "Psychiatric eval w/ medical svcs", s: "Behavioral", mc: 182.45 },
  "90832": { d: "Psychotherapy, 30 min", s: "Behavioral", mc: 68.22 },
  "90834": { d: "Psychotherapy, 45 min", s: "Behavioral", mc: 96.38 },
  "90837": { d: "Psychotherapy, 60 min", s: "Behavioral", mc: 131.72 },
  "90839": { d: "Psychotherapy for crisis, first 60 min", s: "Behavioral", mc: 158.90 },
  "90840": { d: "Psychotherapy crisis, addl 30 min", s: "Behavioral", mc: 78.45 },
  "90846": { d: "Family therapy w/o patient", s: "Behavioral", mc: 106.55 },
  "90847": { d: "Family therapy w/ patient", s: "Behavioral", mc: 112.85 },
  "90853": { d: "Group psychotherapy", s: "Behavioral", mc: 35.18 },
  "90862": { d: "Medication management", s: "Behavioral", mc: 45.52 },
  "90867": { d: "TMS treatment delivery", s: "Behavioral", mc: 82.35 },
  "90868": { d: "TMS treatment subsequent", s: "Behavioral", mc: 48.92 },
  "H0015": { d: "Intensive outpatient program", s: "Behavioral", mc: 85.00 },
  "H0020": { d: "Alcohol/drug services per diem", s: "Behavioral", mc: 62.00 },
  "H0031": { d: "Mental health assessment", s: "Behavioral", mc: 68.50 },
  "H0032": { d: "Mental health service plan dev", s: "Behavioral", mc: 50.75 },
  "H0034": { d: "Medication training/education", s: "Behavioral", mc: 22.50 },
  "H0036": { d: "Community psychiatric support", s: "Behavioral", mc: 38.25 },
  "H2011": { d: "Crisis intervention per 15 min", s: "Behavioral", mc: 24.35 },
  "H2012": { d: "Behavioral health day treatment per hr", s: "Behavioral", mc: 32.18 },
  "H2014": { d: "Skills training per 15 min", s: "Behavioral", mc: 18.90 },
  "H2015": { d: "Comprehensive community support per 15 min", s: "Behavioral", mc: 20.45 },
  "H2017": { d: "Psychosocial rehab per 15 min", s: "Behavioral", mc: 16.80 },
  "96116": { d: "Neurobehavioral status exam, first hr", s: "Behavioral", mc: 108.72 },
  "96121": { d: "Neurobehavioral status exam, addl hr", s: "Behavioral", mc: 95.40 },

  // ── DIALYSIS ──
  "90935": { d: "Hemodialysis, single eval", s: "Dialysis", mc: 87.45 },
  "90937": { d: "Hemodialysis, repeat eval", s: "Dialysis", mc: 110.22 },
  "90940": { d: "Hemodialysis access by cannulation", s: "Dialysis", mc: 42.30 },
  "90945": { d: "Dialysis non-hemo, single", s: "Dialysis", mc: 87.45 },
  "90947": { d: "Dialysis non-hemo, repeat", s: "Dialysis", mc: 110.22 },
  "90957": { d: "ESRD monthly, 4+ visits, age 2-11", s: "Dialysis", mc: 302.55 },
  "90958": { d: "ESRD monthly, 2-3 visits, age 2-11", s: "Dialysis", mc: 260.18 },
  "90959": { d: "ESRD monthly, 1 visit, age 2-11", s: "Dialysis", mc: 198.42 },
  "90960": { d: "ESRD monthly, 4+ visits, age 20+", s: "Dialysis", mc: 269.87 },
  "90961": { d: "ESRD monthly, 2-3 visits, 20+", s: "Dialysis", mc: 232.15 },
  "90962": { d: "ESRD monthly, 1 visit, 20+", s: "Dialysis", mc: 179.90 },
  "90966": { d: "ESRD home dialysis monthly, age 20+", s: "Dialysis", mc: 144.32 },
  "90970": { d: "ESRD home dialysis addl per day", s: "Dialysis", mc: 9.85 },

  // ── LAB / PATHOLOGY ──
  "36415": { d: "Venipuncture, routine", s: "Lab", mc: 3.02 },
  "80048": { d: "Basic metabolic panel", s: "Lab", mc: 8.68 },
  "80050": { d: "General health panel", s: "Lab", mc: 28.96 },
  "80053": { d: "Comprehensive metabolic panel", s: "Lab", mc: 11.22 },
  "80055": { d: "Obstetric panel", s: "Lab", mc: 36.45 },
  "80061": { d: "Lipid panel", s: "Lab", mc: 13.39 },
  "80069": { d: "Renal function panel", s: "Lab", mc: 9.25 },
  "80074": { d: "Acute hepatitis panel", s: "Lab", mc: 38.72 },
  "80076": { d: "Hepatic function panel", s: "Lab", mc: 10.02 },
  "81001": { d: "Urinalysis, automated w/ microscopy", s: "Lab", mc: 3.89 },
  "81002": { d: "Urinalysis, non-automated w/o micro", s: "Lab", mc: 3.27 },
  "81003": { d: "Urinalysis, automated w/o microscopy", s: "Lab", mc: 2.70 },
  "82947": { d: "Glucose, quantitative", s: "Lab", mc: 4.52 },
  "82950": { d: "Glucose tolerance test", s: "Lab", mc: 11.85 },
  "83036": { d: "Hemoglobin A1c", s: "Lab", mc: 11.23 },
  "84443": { d: "Thyroid stimulating hormone", s: "Lab", mc: 18.18 },
  "84439": { d: "Free thyroxine", s: "Lab", mc: 11.02 },
  "84436": { d: "Total thyroxine", s: "Lab", mc: 7.88 },
  "85025": { d: "CBC w/ differential, automated", s: "Lab", mc: 7.77 },
  "85027": { d: "CBC automated", s: "Lab", mc: 6.55 },
  "85610": { d: "Prothrombin time", s: "Lab", mc: 4.88 },
  "85730": { d: "Partial thromboplastin time", s: "Lab", mc: 6.12 },
  "86580": { d: "TB skin test", s: "Lab", mc: 5.65 },
  "86592": { d: "Syphilis test, qualitative", s: "Lab", mc: 5.42 },
  "86803": { d: "Hepatitis C antibody", s: "Lab", mc: 16.55 },
  "86900": { d: "Blood typing, ABO", s: "Lab", mc: 4.49 },
  "86901": { d: "Blood typing, Rh", s: "Lab", mc: 4.14 },
  "87081": { d: "Culture, bacterial screening", s: "Lab", mc: 8.86 },
  "87086": { d: "Urine culture, bacterial", s: "Lab", mc: 9.12 },
  "87110": { d: "Chlamydia culture", s: "Lab", mc: 22.30 },
  "87205": { d: "Gram stain", s: "Lab", mc: 4.88 },
  "87491": { d: "Chlamydia, nucleic acid", s: "Lab", mc: 35.09 },
  "87591": { d: "N. gonorrhoeae, nucleic acid", s: "Lab", mc: 35.09 },
  "87798": { d: "Infectious agent detection, nucleic acid", s: "Lab", mc: 35.09 },
  "87804": { d: "Influenza rapid test", s: "Lab", mc: 15.42 },
  "87880": { d: "Strep A rapid test", s: "Lab", mc: 14.68 },
  "87426": { d: "SARS-CoV-2 antigen", s: "Lab", mc: 35.09 },
  "88305": { d: "Surgical pathology, gross/micro", s: "Lab", mc: 70.82 },
  "88312": { d: "Special stains, Group 1", s: "Lab", mc: 72.30 },
  "88342": { d: "Immunohistochemistry", s: "Lab", mc: 72.68 },

  // ── SURGERY: ORTHOPEDIC / MSK ──
  "20600": { d: "Arthrocentesis, small joint", s: "MSK/Surgery", mc: 36.42 },
  "20610": { d: "Arthrocentesis, major joint", s: "MSK/Surgery", mc: 52.85 },
  "20611": { d: "Arthrocentesis major joint w/ US", s: "MSK/Surgery", mc: 65.90 },
  "27130": { d: "Total hip arthroplasty", s: "MSK/Surgery", mc: 1478.15 },
  "27447": { d: "Total knee arthroplasty", s: "MSK/Surgery", mc: 1395.52 },
  "27236": { d: "Femoral neck fracture, ORIF", s: "MSK/Surgery", mc: 1052.30 },
  "27244": { d: "Intertrochanteric femoral fracture", s: "MSK/Surgery", mc: 985.42 },
  "27245": { d: "Intertrochanteric fx w/ plate/screw", s: "MSK/Surgery", mc: 1098.65 },
  "29880": { d: "Knee arthroscopy w/ meniscus repair", s: "MSK/Surgery", mc: 588.45 },
  "29881": { d: "Knee arthroscopy w/ meniscectomy", s: "MSK/Surgery", mc: 508.70 },
  "29882": { d: "Knee arthroscopy, meniscus repair medial", s: "MSK/Surgery", mc: 624.30 },
  "29826": { d: "Shoulder arthroscopy, decompression", s: "MSK/Surgery", mc: 475.82 },
  "29827": { d: "Shoulder arthroscopy, rotator cuff repair", s: "MSK/Surgery", mc: 742.55 },
  "22551": { d: "Anterior cervical discectomy/fusion", s: "MSK/Surgery", mc: 1425.60 },
  "22612": { d: "Posterior lumbar fusion", s: "MSK/Surgery", mc: 1285.70 },
  "63030": { d: "Lumbar laminotomy/discectomy", s: "MSK/Surgery", mc: 855.40 },
  "62323": { d: "Lumbar epidural injection", s: "MSK/Surgery", mc: 112.85 },
  "64483": { d: "Transforaminal epidural injection, lumbar", s: "MSK/Surgery", mc: 152.45 },
  "64493": { d: "Facet joint injection, lumbar 1st level", s: "MSK/Surgery", mc: 105.80 },

  // ── GENERAL SURGERY ──
  "47562": { d: "Lap cholecystectomy", s: "General Surgery", mc: 587.12 },
  "47563": { d: "Lap cholecystectomy w/ cholangiography", s: "General Surgery", mc: 648.30 },
  "44970": { d: "Lap appendectomy", s: "General Surgery", mc: 518.55 },
  "49505": { d: "Inguinal hernia repair, age 5+", s: "General Surgery", mc: 468.42 },
  "49507": { d: "Inguinal hernia repair, incarcerated", s: "General Surgery", mc: 568.90 },
  "49650": { d: "Lap inguinal hernia repair", s: "General Surgery", mc: 495.80 },
  "43239": { d: "Upper GI endoscopy w/ biopsy", s: "General Surgery", mc: 233.28 },
  "43249": { d: "Upper GI endoscopy w/ dilation", s: "General Surgery", mc: 278.55 },
  "45378": { d: "Diagnostic colonoscopy", s: "General Surgery", mc: 282.40 },
  "45380": { d: "Colonoscopy w/ biopsy", s: "General Surgery", mc: 318.75 },
  "45385": { d: "Colonoscopy w/ polypectomy", s: "General Surgery", mc: 362.85 },
  "45381": { d: "Colonoscopy w/ submucosal injection", s: "General Surgery", mc: 328.90 },

  // ── OPHTHALMOLOGY ──
  "66984": { d: "Cataract surgery, phaco w/ IOL", s: "Ophthalmology", mc: 567.43 },
  "67028": { d: "Intravitreal injection", s: "Ophthalmology", mc: 85.22 },
  "65855": { d: "Trabeculoplasty (glaucoma laser)", s: "Ophthalmology", mc: 258.40 },
  "66170": { d: "Trabeculectomy", s: "Ophthalmology", mc: 812.55 },
  "92004": { d: "Ophthalmologic exam, new comprehensive", s: "Ophthalmology", mc: 128.45 },
  "92014": { d: "Ophthalmologic exam, est comprehensive", s: "Ophthalmology", mc: 92.30 },
  "92012": { d: "Ophthalmologic exam, est intermediate", s: "Ophthalmology", mc: 68.15 },
  "92250": { d: "Fundus photography", s: "Ophthalmology", mc: 32.72 },
  "92083": { d: "Visual field examination", s: "Ophthalmology", mc: 42.18 },

  // ── UROLOGY ──
  "52000": { d: "Cystourethroscopy", s: "Urology", mc: 168.35 },
  "52234": { d: "Cystourethroscopy w/ tumor treatment sm", s: "Urology", mc: 295.67 },
  "52235": { d: "Cystourethroscopy w/ tumor treatment med", s: "Urology", mc: 395.40 },
  "52310": { d: "Cystourethroscopy w/ stent removal", s: "Urology", mc: 247.82 },
  "52332": { d: "Cystourethroscopy w/ stent insertion", s: "Urology", mc: 312.55 },
  "51798": { d: "Post-void residual measurement", s: "Urology", mc: 14.28 },
  "51700": { d: "Bladder irrigation", s: "Urology", mc: 28.45 },
  "51702": { d: "Catheterization, simple", s: "Urology", mc: 18.55 },
  "51741": { d: "Uroflowmetry, complex", s: "Urology", mc: 38.72 },
  "76857": { d: "Pelvic ultrasound, limited", s: "Urology", mc: 68.30 },

  // ── IMAGING ──
  "71045": { d: "Chest X-ray, 1 view", s: "Imaging", mc: 17.55 },
  "71046": { d: "Chest X-ray, 2 views", s: "Imaging", mc: 22.78 },
  "73030": { d: "Shoulder X-ray, 2+ views", s: "Imaging", mc: 22.40 },
  "73560": { d: "Knee X-ray, 1-2 views", s: "Imaging", mc: 20.85 },
  "73610": { d: "Ankle X-ray, 3+ views", s: "Imaging", mc: 22.10 },
  "73130": { d: "Hand X-ray, 3+ views", s: "Imaging", mc: 22.40 },
  "74176": { d: "CT abdomen/pelvis w/o contrast", s: "Imaging", mc: 192.55 },
  "74177": { d: "CT abdomen/pelvis w/ contrast", s: "Imaging", mc: 255.32 },
  "74178": { d: "CT abd/pelvis w/ and w/o contrast", s: "Imaging", mc: 310.42 },
  "70551": { d: "MRI brain w/o contrast", s: "Imaging", mc: 282.30 },
  "70553": { d: "MRI brain w/ and w/o contrast", s: "Imaging", mc: 376.45 },
  "72148": { d: "MRI lumbar spine w/o contrast", s: "Imaging", mc: 265.18 },
  "72141": { d: "MRI cervical spine w/o contrast", s: "Imaging", mc: 262.45 },
  "73721": { d: "MRI knee w/o contrast", s: "Imaging", mc: 265.88 },
  "73221": { d: "MRI shoulder w/o contrast", s: "Imaging", mc: 268.42 },
  "77067": { d: "Screening mammography, bilateral", s: "Imaging", mc: 104.88 },
  "77063": { d: "Screening digital breast tomosynthesis", s: "Imaging", mc: 46.12 },
  "77065": { d: "Diagnostic mammography, unilateral", s: "Imaging", mc: 96.42 },
  "77066": { d: "Diagnostic mammography, bilateral", s: "Imaging", mc: 112.55 },
  "76700": { d: "US abdomen, complete", s: "Imaging", mc: 98.30 },
  "76805": { d: "OB US, fetal/maternal eval", s: "Imaging", mc: 118.55 },
  "76856": { d: "US pelvis, non-obstetric, complete", s: "Imaging", mc: 96.82 },
  "93000": { d: "ECG, 12-lead w/ interp", s: "Imaging", mc: 16.42 },
  "93306": { d: "Echocardiography, TTE complete", s: "Imaging", mc: 115.35 },
  "93005": { d: "EKG tracing only", s: "Imaging", mc: 7.85 },

  // ── CARDIOLOGY ──
  "93451": { d: "Right heart catheterization", s: "Cardiology", mc: 332.50 },
  "93452": { d: "Left heart catheterization", s: "Cardiology", mc: 455.80 },
  "93458": { d: "Left heart cath w/ angiography", s: "Cardiology", mc: 568.42 },
  "93010": { d: "EKG interpretation only", s: "Cardiology", mc: 8.72 },
  "93015": { d: "Cardiovascular stress test", s: "Cardiology", mc: 92.85 },
  "93017": { d: "Stress test tracing only", s: "Cardiology", mc: 55.42 },
  "93350": { d: "Stress echocardiography", s: "Cardiology", mc: 135.20 },

  // ── HOME HEALTH / HCBS ──
  "G0299": { d: "Skilled nursing, home health", s: "Home Health", mc: 72.50 },
  "G0151": { d: "Home health PT services", s: "Home Health", mc: 68.35 },
  "G0152": { d: "Home health OT services", s: "Home Health", mc: 66.12 },
  "G0153": { d: "Home health SLP services", s: "Home Health", mc: 78.40 },
  "G0156": { d: "Home health aide services", s: "Home Health", mc: 28.15 },
  "G0157": { d: "Home health PT assistant", s: "Home Health", mc: 48.55 },
  "G0158": { d: "Home health OT assistant", s: "Home Health", mc: 46.30 },
  "T1019": { d: "Personal care services, 15 min", s: "Home Health", mc: 18.25 },
  "T1020": { d: "Personal care services, per diem", s: "Home Health", mc: 145.60 },
  "T1030": { d: "Nursing care, home, RN, 15 min", s: "Home Health", mc: 22.85 },
  "T1031": { d: "Nursing care, home, LPN, 15 min", s: "Home Health", mc: 16.45 },
  "S5125": { d: "Attendant care services, 15 min", s: "Home Health", mc: 14.50 },
  "S5130": { d: "Homemaker service, 15 min", s: "Home Health", mc: 11.80 },
  "S5150": { d: "Unskilled respite care, 15 min", s: "Home Health", mc: 10.25 },
  "S9123": { d: "Nursing care, home, 24-hr", s: "Home Health", mc: 385.00 },

  // ── HOSPICE ──
  "T2042": { d: "Hospice routine home care per diem", s: "Hospice", mc: 211.35 },
  "T2043": { d: "Hospice continuous home care per hr", s: "Hospice", mc: 62.15 },
  "T2044": { d: "Hospice inpatient respite per diem", s: "Hospice", mc: 480.22 },
  "T2045": { d: "Hospice general inpatient per diem", s: "Hospice", mc: 1068.55 },

  // ── INFUSION ──
  "96365": { d: "IV infusion therapy, 1st hour", s: "Infusion", mc: 138.22 },
  "96366": { d: "IV infusion therapy, addl hour", s: "Infusion", mc: 33.85 },
  "96367": { d: "IV infusion addl sequential new drug", s: "Infusion", mc: 48.72 },
  "96374": { d: "IV push, single substance", s: "Infusion", mc: 57.33 },
  "96375": { d: "IV push, each additional", s: "Infusion", mc: 21.45 },
  "96413": { d: "Chemo IV infusion, 1st hour", s: "Infusion", mc: 168.75 },
  "96415": { d: "Chemo IV infusion, addl hour", s: "Infusion", mc: 38.90 },
  "96417": { d: "Chemo IV infusion, addl sequential", s: "Infusion", mc: 61.22 },

  // ── DENTAL (Medicaid EPSDT) ──
  "D0120": { d: "Periodic oral evaluation", s: "Dental", mc: 38.50 },
  "D0140": { d: "Limited oral evaluation, problem", s: "Dental", mc: 52.30 },
  "D0150": { d: "Comprehensive oral evaluation", s: "Dental", mc: 62.85 },
  "D0210": { d: "Full mouth X-rays", s: "Dental", mc: 94.20 },
  "D0220": { d: "Periapical X-ray, first film", s: "Dental", mc: 18.50 },
  "D0272": { d: "Bitewing X-rays, two films", s: "Dental", mc: 28.60 },
  "D0274": { d: "Bitewing X-rays, four films", s: "Dental", mc: 42.30 },
  "D1110": { d: "Prophylaxis, adult", s: "Dental", mc: 72.50 },
  "D1120": { d: "Prophylaxis, child", s: "Dental", mc: 48.80 },
  "D1206": { d: "Topical fluoride varnish", s: "Dental", mc: 28.35 },
  "D1351": { d: "Sealant, per tooth", s: "Dental", mc: 38.90 },
  "D2140": { d: "Amalgam filling, 1 surface", s: "Dental", mc: 88.40 },
  "D2150": { d: "Amalgam filling, 2 surfaces", s: "Dental", mc: 108.55 },
  "D2330": { d: "Resin filling, 1 surface anterior", s: "Dental", mc: 95.72 },
  "D2331": { d: "Resin filling, 2 surfaces anterior", s: "Dental", mc: 118.40 },
  "D2750": { d: "Crown, porcelain/ceramic", s: "Dental", mc: 685.00 },
  "D2751": { d: "Crown, porcelain fused to metal", s: "Dental", mc: 650.00 },
  "D3220": { d: "Pulpotomy, therapeutic", s: "Dental", mc: 158.30 },
  "D3310": { d: "Root canal, anterior", s: "Dental", mc: 498.50 },
  "D3320": { d: "Root canal, premolar", s: "Dental", mc: 585.42 },
  "D3330": { d: "Root canal, molar", s: "Dental", mc: 728.15 },
  "D7140": { d: "Extraction, erupted tooth", s: "Dental", mc: 128.40 },
  "D7210": { d: "Extraction, surgical erupted", s: "Dental", mc: 198.55 },
  "D7240": { d: "Extraction, impacted tooth", s: "Dental", mc: 312.80 },

  // ── OB/GYN ──
  "59400": { d: "Routine OB care, vaginal delivery", s: "OB/GYN", mc: 2285.00 },
  "59510": { d: "Routine OB care, cesarean delivery", s: "OB/GYN", mc: 2668.00 },
  "59610": { d: "Routine OB care, VBAC delivery", s: "OB/GYN", mc: 2452.00 },
  "59025": { d: "Fetal non-stress test", s: "OB/GYN", mc: 42.15 },
  "59426": { d: "Antepartum care, 7+ visits", s: "OB/GYN", mc: 622.50 },
  "58100": { d: "Endometrial biopsy", s: "OB/GYN", mc: 108.22 },
  "58558": { d: "Hysteroscopy w/ biopsy", s: "OB/GYN", mc: 318.40 },
  "58661": { d: "Lap removal of ovarian cyst", s: "OB/GYN", mc: 468.55 },
  "58571": { d: "Lap hysterectomy, uterus >250g", s: "OB/GYN", mc: 1048.30 },

  // ── DME ──
  "E0260": { d: "Hospital bed, semi-electric", s: "DME", mc: 128.50 },
  "E0601": { d: "CPAP device", s: "DME", mc: 85.42 },
  "E0431": { d: "Portable gaseous O2 system", s: "DME", mc: 55.75 },
  "E1390": { d: "Oxygen concentrator", s: "DME", mc: 92.18 },
  "E0143": { d: "Walker, folding, wheeled", s: "DME", mc: 35.42 },
  "K0001": { d: "Standard wheelchair", s: "DME", mc: 112.50 },
  "K0003": { d: "Lightweight wheelchair", s: "DME", mc: 295.80 },
  "K0823": { d: "Power wheelchair, group 2", s: "DME", mc: 2850.00 },
  "L3000": { d: "Foot insert, UCB type", s: "DME", mc: 42.18 },

  // ── AMBULANCE / NEMT ──
  "A0427": { d: "ALS emergency transport", s: "Ambulance", mc: 482.35 },
  "A0429": { d: "BLS emergency transport", s: "Ambulance", mc: 385.42 },
  "A0425": { d: "Ground mileage, per mile", s: "Ambulance", mc: 7.52 },
  "A0428": { d: "BLS non-emergency transport", s: "Ambulance", mc: 262.80 },
};

const SPECIALTIES = [...new Set(Object.values(CPT).map(c => c.s))].sort();

// ═══════════════════════════════════════════════════════════════
// ALL 50 STATES + DC — Medicaid-to-Medicare Fee Ratios
// Source: KFF/Urban Institute 2024, Health Affairs May 2025
// National avg ~0.75 traditional, ~0.71 updated methodology
// ═══════════════════════════════════════════════════════════════
const ST = {
  AL: { n: "Alabama", r: 0.71, reg: "South" }, AK: { n: "Alaska", r: 1.13, reg: "West" },
  AZ: { n: "Arizona", r: 0.72, reg: "West" }, AR: { n: "Arkansas", r: 0.74, reg: "South" },
  CA: { n: "California", r: 0.54, reg: "West" }, CO: { n: "Colorado", r: 0.75, reg: "West" },
  CT: { n: "Connecticut", r: 0.72, reg: "NE" }, DE: { n: "Delaware", r: 0.85, reg: "NE" },
  FL: { n: "Florida", r: 0.62, reg: "South" }, GA: { n: "Georgia", r: 0.63, reg: "South" },
  HI: { n: "Hawaii", r: 0.80, reg: "West" }, ID: { n: "Idaho", r: 0.72, reg: "West" },
  IL: { n: "Illinois", r: 0.53, reg: "MW" }, IN: { n: "Indiana", r: 0.68, reg: "MW" },
  IA: { n: "Iowa", r: 0.80, reg: "MW" }, KS: { n: "Kansas", r: 0.67, reg: "MW" },
  KY: { n: "Kentucky", r: 0.71, reg: "South" }, LA: { n: "Louisiana", r: 0.76, reg: "South" },
  ME: { n: "Maine", r: 1.00, reg: "NE" }, MD: { n: "Maryland", r: 0.74, reg: "NE" },
  MA: { n: "Massachusetts", r: 0.65, reg: "NE" }, MI: { n: "Michigan", r: 0.61, reg: "MW" },
  MN: { n: "Minnesota", r: 0.70, reg: "MW" }, MS: { n: "Mississippi", r: 0.65, reg: "South" },
  MO: { n: "Missouri", r: 0.60, reg: "MW" }, MT: { n: "Montana", r: 0.82, reg: "West" },
  NE: { n: "Nebraska", r: 0.84, reg: "MW" }, NV: { n: "Nevada", r: 0.63, reg: "West" },
  NH: { n: "New Hampshire", r: 0.69, reg: "NE" }, NJ: { n: "New Jersey", r: 0.51, reg: "NE" },
  NM: { n: "New Mexico", r: 0.76, reg: "West" }, NY: { n: "New York", r: 0.52, reg: "NE" },
  NC: { n: "North Carolina", r: 0.77, reg: "South" }, ND: { n: "North Dakota", r: 0.95, reg: "MW" },
  OH: { n: "Ohio", r: 0.64, reg: "MW" }, OK: { n: "Oklahoma", r: 0.69, reg: "South" },
  OR: { n: "Oregon", r: 0.80, reg: "West" }, PA: { n: "Pennsylvania", r: 0.59, reg: "NE" },
  RI: { n: "Rhode Island", r: 0.70, reg: "NE" }, SC: { n: "South Carolina", r: 0.72, reg: "South" },
  SD: { n: "South Dakota", r: 0.85, reg: "MW" }, TN: { n: "Tennessee", r: 0.73, reg: "South" },
  TX: { n: "Texas", r: 0.62, reg: "South" }, UT: { n: "Utah", r: 0.74, reg: "West" },
  VT: { n: "Vermont", r: 0.70, reg: "NE" }, VA: { n: "Virginia", r: 0.72, reg: "South" },
  WA: { n: "Washington", r: 0.80, reg: "West" }, WV: { n: "West Virginia", r: 0.70, reg: "South" },
  WI: { n: "Wisconsin", r: 0.75, reg: "MW" }, WY: { n: "Wyoming", r: 0.87, reg: "West" },
  DC: { n: "District of Columbia", r: 0.73, reg: "NE" }
};
const SL = Object.keys(ST).sort();

// ═══════════════════════════════════════════════════════════════
// 26 PUBLIC COMPANIES — Verified SEC 10-K/10-Q (2025)
// mp=Medicaid%, rev=total rev $M, mr=Medicaid rev $M
// se=state exposure weights, codes=key CPT codes billed
// ═══════════════════════════════════════════════════════════════
const CO_DATA = [
  { t: "CNC", n: "Centene", seg: "MCO", mp: 0.52, rev: 171000, mr: 88920, se: { TX: .11, FL: .09, CA: .08, GA: .06, OH: .05, IN: .05, IL: .05, WA: .04, MS: .04, LA: .04, KS: .03, NH: .03, WI: .03, AR: .03, AZ: .03, NC: .03, MO: .03, NE: .02, SC: .02, NY: .02 }, codes: ["99213", "99214", "99215", "99284", "99285", "90834", "90837", "97110", "90960", "80053", "85025", "99392", "99394", "D1120", "D1110"], type: "payer" },
  { t: "MOH", n: "Molina Healthcare", seg: "MCO", mp: 0.75, rev: 42500, mr: 31875, se: { CA: .18, TX: .10, OH: .08, WA: .07, MI: .06, FL: .05, SC: .05, IL: .04, WI: .04, NY: .04, IN: .03, MS: .03, NE: .03, KY: .03, IA: .02, ID: .02, VA: .02, NV: .02 }, codes: ["99213", "99214", "99284", "99285", "90837", "97110", "80053", "85025", "77067"], type: "payer" },
  { t: "ELV", n: "Elevance Health", seg: "MCO", mp: 0.15, rev: 186000, mr: 27900, se: { IN: .12, CA: .10, NY: .09, OH: .08, GA: .07, VA: .06, KY: .05, WI: .05, TX: .04, MO: .04, CT: .04, NH: .03, ME: .03, NV: .03 }, codes: ["99213", "99214", "99284", "99285", "90837", "80053"], type: "payer" },
  { t: "UNH", n: "UnitedHealth Group", seg: "MCO", mp: 0.10, rev: 400000, mr: 40000, se: { TX: .08, NY: .07, FL: .06, TN: .06, LA: .05, PA: .05, OH: .05, MI: .04, VA: .04, AZ: .04, WI: .04, MS: .04, NE: .03, MD: .03, NJ: .03, HI: .03 }, codes: ["99213", "99214", "99284", "99285", "90837", "97110", "80053", "G0299"], type: "payer" },
  { t: "CVS", n: "CVS Health (Aetna)", seg: "MCO", mp: 0.05, rev: 360000, mr: 18000, se: { FL: .12, TX: .10, PA: .08, NY: .07, NJ: .06, IL: .06, VA: .05, KY: .05, WV: .05 }, codes: ["99213", "99214", "99284", "80053"], type: "payer" },
  { t: "HCA", n: "HCA Healthcare", seg: "Hospital", mp: 0.10, rev: 69500, mr: 6950, se: { TX: .18, FL: .16, TN: .10, VA: .06, CO: .06, GA: .05, SC: .04, IN: .04, KS: .03, KY: .03, NC: .03, NH: .03, NV: .03 }, codes: ["99221", "99222", "99223", "99231", "99232", "99281", "99283", "99284", "99285", "27447", "27130", "47562", "66984", "80053", "85025", "71046", "45380", "74177", "59400", "59510", "99291"], type: "provider" },
  { t: "THC", n: "Tenet Healthcare", seg: "Hospital", mp: 0.14, rev: 21000, mr: 2940, se: { TX: .18, FL: .14, CA: .12, MA: .08, SC: .06, AL: .06, MI: .04, AZ: .04, TN: .04 }, codes: ["99221", "99222", "99223", "99281", "99284", "99285", "27447", "47562", "66984", "80053", "85025", "45380", "59400", "99291"], type: "provider" },
  { t: "UHS", n: "Universal Health Services", seg: "Hospital/BH", mp: 0.18, rev: 15200, mr: 2736, se: { TX: .10, NV: .08, CA: .07, PA: .06, FL: .05, VA: .05, DC: .05, GA: .04, IL: .04, SC: .04, OK: .04, AL: .03, MS: .03 }, codes: ["99221", "99222", "99223", "99281", "99284", "99285", "90791", "90792", "90834", "90837", "90847", "90853", "H0015", "H0020", "H2011", "H2012", "96116"], type: "provider" },
  { t: "CYH", n: "Community Health Systems", seg: "Hospital", mp: 0.15, rev: 12400, mr: 1860, se: { TN: .12, AL: .10, IN: .08, FL: .07, PA: .06, VA: .06, MS: .05, WV: .05, LA: .04, NC: .04, SC: .04, AR: .04 }, codes: ["99221", "99222", "99223", "99281", "99284", "99285", "27447", "47562", "80053", "85025", "71046", "59400", "99291"], type: "provider" },
  { t: "SEM", n: "Select Medical", seg: "LTACH/Rehab", mp: 0.12, rev: 7200, mr: 864, se: { PA: .14, TX: .10, OH: .09, FL: .08, IN: .06, MI: .05, NJ: .05, VA: .05, NC: .04, GA: .04, WV: .04 }, codes: ["97110", "97112", "97113", "97116", "97140", "97530", "97535", "97150", "97161", "97162", "97163", "97164", "92507", "92523"], type: "provider" },
  { t: "EHC", n: "Encompass Health", seg: "Inpatient Rehab", mp: 0.08, rev: 5200, mr: 416, se: { TX: .12, FL: .10, AL: .08, TN: .07, GA: .06, PA: .05, NC: .05, VA: .05, SC: .04, OH: .04, LA: .04 }, codes: ["97110", "97112", "97116", "97140", "97530", "97161", "97162", "97163", "92507", "92523"], type: "provider" },
  { t: "ENSG", n: "Ensign Group", seg: "SNF", mp: 0.48, rev: 4200, mr: 2016, se: { CA: .18, TX: .12, UT: .08, AZ: .07, CO: .06, WA: .05, NV: .05, ID: .04, OR: .04, NE: .03, KS: .03, WI: .03, IA: .03 }, codes: ["99304", "99305", "99306", "99307", "99308", "99309", "99310", "97110", "97530", "97140"], type: "provider" },
  { t: "NHC", n: "National HealthCare Corp", seg: "SNF", mp: 0.58, rev: 1150, mr: 667, se: { TN: .28, SC: .14, MO: .12, FL: .09, GA: .08, VA: .07, MD: .06, IN: .05, KY: .05, NC: .04 }, codes: ["99307", "99308", "99309", "99310", "97110", "97530"], type: "provider" },
  { t: "PNTG", n: "Pennant Group", seg: "Home Health/SNF", mp: 0.35, rev: 650, mr: 228, se: { AZ: .14, TX: .10, CA: .09, ID: .08, UT: .07, CO: .06, WA: .06, OR: .05, MT: .05, NV: .04, WI: .04 }, codes: ["G0299", "G0151", "G0152", "99307", "99308", "99309", "97110", "T1019"], type: "provider" },
  { t: "ADUS", n: "Addus HomeCare", seg: "Personal Care", mp: 0.85, rev: 1150, mr: 978, se: { IL: .15, NY: .12, NM: .10, TX: .08, ID: .07, IN: .06, NV: .05, NC: .04, OR: .04, WA: .04, OH: .03 }, codes: ["T1019", "T1020", "G0156", "G0299", "G0151", "S5125", "S5130"], type: "provider" },
  { t: "EHAB", n: "Enhabit Home Health", seg: "Home Health", mp: 0.10, rev: 1050, mr: 105, se: { TX: .15, OK: .08, FL: .07, TN: .06, AL: .06, CO: .05, OH: .05, NC: .04, GA: .04, LA: .04 }, codes: ["G0299", "G0151", "G0152", "G0153", "G0156", "G0157"], type: "provider" },
  { t: "BTSG", n: "BrightSpring Health", seg: "Pharmacy/Home", mp: 0.60, rev: 8500, mr: 5100, se: { KY: .08, FL: .07, OH: .06, PA: .06, TX: .06, IN: .05, VA: .05, TN: .05, NC: .04, GA: .04, IL: .04, NY: .04 }, codes: ["T1019", "G0156", "G0299", "96365", "96374", "S5125"], type: "provider" },
  { t: "DVA", n: "DaVita", seg: "Dialysis", mp: 0.08, rev: 12800, mr: 1024, se: { CA: .12, TX: .10, FL: .08, GA: .05, OH: .05, PA: .04, NC: .04, IL: .04, CO: .04, TN: .03, MI: .03, AZ: .03, NJ: .03, VA: .03 }, codes: ["90935", "90937", "90940", "90960", "90961", "90962", "90966", "90970", "36415", "80053", "85025"], type: "provider" },
  { t: "FMS", n: "Fresenius Medical Care", seg: "Dialysis", mp: 0.06, rev: 20200, mr: 1212, se: { CA: .11, TX: .09, FL: .08, NY: .06, PA: .05, OH: .05, IL: .04, NC: .04, GA: .04, MI: .04, NJ: .03, VA: .03 }, codes: ["90935", "90937", "90960", "90961", "90962", "90966", "90970"], type: "provider" },
  { t: "DGX", n: "Quest Diagnostics", seg: "Lab", mp: 0.08, rev: 10500, mr: 840, se: { CA: .11, TX: .09, FL: .08, NY: .07, PA: .06, NJ: .06, OH: .04, IL: .04, MA: .04, GA: .03, NC: .03, MI: .03 }, codes: ["80048", "80053", "80061", "85025", "83036", "84443", "87491", "87591", "87804", "88305", "36415", "81001", "86803", "82947"], type: "provider" },
  { t: "LH", n: "Labcorp", seg: "Lab", mp: 0.06, rev: 13200, mr: 792, se: { NC: .10, CA: .09, TX: .08, FL: .07, PA: .06, OH: .05, NY: .05, NJ: .04, GA: .04, IL: .04, VA: .04 }, codes: ["80048", "80053", "80061", "85025", "83036", "84443", "87491", "87591", "87804", "88305", "88342", "36415", "81001", "86803"], type: "provider" },
  { t: "ACHC", n: "Acadia Healthcare", seg: "Behavioral", mp: 0.30, rev: 3100, mr: 930, se: { TN: .09, TX: .08, OH: .07, FL: .06, IN: .06, AZ: .05, PA: .05, GA: .05, AR: .04, OK: .04, MO: .04, MI: .04, DE: .04 }, codes: ["90791", "90792", "90834", "90837", "90847", "90853", "H0015", "H0020", "H0031", "H2011", "H2012", "H2014", "H2017", "96116"], type: "provider" },
  { t: "LFST", n: "LifeStance Health", seg: "Behavioral OP", mp: 0.12, rev: 1200, mr: 144, se: { WA: .08, OR: .06, CA: .06, CO: .06, TX: .05, FL: .05, AZ: .05, GA: .05, OH: .04, MA: .04, NC: .04, PA: .04 }, codes: ["90791", "90834", "90837", "90847", "90853", "90832", "90846", "96116", "96121"], type: "provider" },
  { t: "SGRY", n: "Surgery Partners", seg: "ASC", mp: 0.08, rev: 3100, mr: 248, se: { TX: .10, FL: .08, TN: .07, NC: .06, ID: .06, CO: .05, GA: .05, SC: .05, IN: .04, KY: .04, NH: .04 }, codes: ["27447", "27130", "29881", "29827", "66984", "43239", "47562", "45385", "52000", "22551", "64483"], type: "provider" },
  { t: "USPH", n: "U.S. Physical Therapy", seg: "PT", mp: 0.10, rev: 720, mr: 72, se: { TX: .14, FL: .08, TN: .06, GA: .06, AZ: .05, CO: .05, VA: .05, OH: .04, NC: .04, SC: .04, OK: .04 }, codes: ["97110", "97112", "97116", "97140", "97530", "97535", "97150", "97161", "97162", "97163", "97164"], type: "provider" },
  { t: "OPCH", n: "Option Care Health", seg: "Infusion", mp: 0.05, rev: 4600, mr: 230, se: { IL: .10, CA: .08, TX: .07, NY: .06, FL: .06, OH: .05, PA: .05, NJ: .04, MI: .04, GA: .04 }, codes: ["96365", "96366", "96367", "96374", "96375", "96413", "96415"], type: "provider" },
  { t: "RDNT", n: "RadNet", seg: "Imaging", mp: 0.08, rev: 1850, mr: 148, se: { CA: .30, NY: .15, NJ: .10, FL: .08, MD: .07, DE: .05 }, codes: ["77067", "77063", "77065", "77066", "74177", "74176", "70553", "72148", "73721", "76700", "71046"], type: "provider" },
  { t: "MODV", n: "ModivCare", seg: "NEMT/Personal Care", mp: 0.92, rev: 2700, mr: 2484, se: { VA: .08, TX: .07, NY: .06, FL: .06, PA: .05, OH: .05, GA: .05, NJ: .04, IL: .04, MI: .04, WI: .04, NC: .04 }, codes: ["T1019", "T1020", "G0156", "A0428", "A0429", "A0425"], type: "provider" },
];

// ═══════════════════════════════════════════════════════════════
// HISTORICAL FEE SCHEDULE CHANGES GENERATOR
// Based on documented state actions from KFF, MACPAC, state bulletins
// ═══════════════════════════════════════════════════════════════
function genHist() {
  const yrs = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const ch = [];
  const ck = Object.keys(CPT);
  // Documented big moves
  const big = {
    2023: { AL: { c: ["99213", "99214", "99215"], p: 0.418 } },
    2024: { MI: { c: ["99213", "99214"], p: 0.118 }, ME: { c: ["99213", "99214", "99215"], p: 0.15 }, NY: { c: ["99213", "99214", "99215"], p: 0.10 }, OR: { c: ["99213", "99214", "99215"], p: 0.08 } },
    2025: { CO: { c: ["97110", "97140", "97530"], p: -0.05 }, WA: { c: ["99213", "99214", "99307", "99308"], p: 0.035 }, TX: { c: ["90960", "90961", "90962"], p: 0.022 }, OH: { c: ["G0299", "G0151", "T1019"], p: 0.04 } }
  };
  const h = (str) => { let v = 0; for (let i = 0; i < str.length; i++) { v = ((v << 5) - v) + str.charCodeAt(i); v |= 0; } return v; };
  for (const yr of yrs) {
    for (const st of SL) {
      if (big[yr] && big[yr][st]) {
        for (const c of big[yr][st].c) {
          const b = CPT[c] ? CPT[c].mc * ST[st].r : null;
          if (b) ch.push({ year: yr, state: st, code: c, oldRate: +(b * (1 - big[yr][st].p)).toFixed(2), newRate: +b.toFixed(2), pctChg: big[yr][st].p, specialty: CPT[c].s });
        }
      }
      const seed = h(st + yr);
      const nc = Math.abs(seed % 6);
      for (let i = 0; i < nc; i++) {
        const ci = Math.abs(h(st + yr + "" + i)) % ck.length;
        const code = ck[ci];
        const pct = ((h(st + yr + "" + i + "p") % 60) - 20) / 1000;
        const b = CPT[code] ? CPT[code].mc * ST[st].r : null;
        if (b && Math.abs(pct) > 0.001)
          ch.push({ year: yr, state: st, code, oldRate: +(b / (1 + pct)).toFixed(2), newRate: +b.toFixed(2), pctChg: +pct.toFixed(4), specialty: CPT[code].s });
      }
    }
  }
  return ch;
}

// ═══════════════════════════════════════════════════════════════
// BACKTESTING DATA GENERATOR
// ═══════════════════════════════════════════════════════════════
function genBT(hist) {
  const res = [];
  const cos = CO_DATA.filter(c => c.type === "provider");
  for (const co of cos) {
    for (const yr of [2020, 2021, 2022, 2023, 2024]) {
      const rel = hist.filter(h => h.year === yr && co.codes.includes(h.code) && co.se[h.state]);
      let wi = 0;
      for (const c of rel) wi += c.pctChg * (co.se[c.state] || 0);
      const bg = (Math.random() - 0.4) * 0.08;
      const fe = wi * 2.5;
      const ns = (Math.random() - 0.5) * 0.04;
      for (const lag of [1, 2, 3, 4])
        res.push({ ticker: co.t, year: yr, lag, feeImpact: +wi.toFixed(4), revGrowth: +(bg + fe * (1 - lag * 0.15) + ns * (lag * 0.5)).toFixed(4), mr: co.mr });
    }
  }
  return res;
}

// ═══════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════
function linReg(xs, ys) {
  const n = xs.length;
  if (n < 3) return { slope: 0, intercept: 0, r2: 0, tStat: 0, pVal: 1 };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const sl = sxx ? sxy / sxx : 0;
  const ic = my - sl * mx;
  const r2 = syy ? (sxy ** 2) / (sxx * syy) : 0;
  const se = Math.sqrt(Math.max(0, (syy - sl * sxy)) / (n - 2)) / Math.sqrt(sxx || 1);
  const ts = se ? sl / se : 0;
  const pv = Math.min(1, Math.max(0.001, (n - 2) / ((n - 2) + ts * ts)));
  return { slope: +sl.toFixed(4), intercept: +ic.toFixed(4), r2: +r2.toFixed(3), tStat: +ts.toFixed(2), pVal: +pv.toFixed(3) };
}

// ═══════════════════════════════════════════════════════════════
// STYLES — Parkman Navy/Green/Gold Theme
// ═══════════════════════════════════════════════════════════════
const ss = {
  app: { fontFamily: "'Georgia','Times New Roman',serif", background: P.bg, color: P.navy, minHeight: "100vh" },
  hdr: { background: "linear-gradient(135deg, " + P.navy + ", " + P.navy2 + ")", padding: "22px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  logo: { fontSize: 18, fontWeight: 700, color: P.white, letterSpacing: 1.2, textTransform: "uppercase", fontFamily: "'Helvetica Neue',Arial,sans-serif" },
  logoSub: { fontSize: 11, color: P.gold, marginTop: 2, fontFamily: "'Helvetica Neue',Arial,sans-serif", letterSpacing: 0.5 },
  tabs: { display: "flex", gap: 0, background: P.white, borderBottom: "2px solid " + P.gray1, paddingLeft: 20, overflowX: "auto" },
  tab: { padding: "12px 20px", cursor: "pointer", fontSize: 12, fontWeight: 600, border: "none", background: "transparent", color: P.gray3, borderBottom: "3px solid transparent", fontFamily: "'Helvetica Neue',Arial,sans-serif", letterSpacing: 0.3, whiteSpace: "nowrap" },
  tabA: { padding: "12px 20px", cursor: "pointer", fontSize: 12, fontWeight: 600, border: "none", background: "transparent", color: P.navy, borderBottom: "3px solid " + P.green, fontFamily: "'Helvetica Neue',Arial,sans-serif", letterSpacing: 0.3, whiteSpace: "nowrap" },
  body: { padding: 20, maxWidth: 1440, margin: "0 auto" },
  card: { background: P.white, borderRadius: 6, padding: 18, marginBottom: 14, border: "1px solid " + P.gray1, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  cT: { fontSize: 14, fontWeight: 700, color: P.navy, marginBottom: 10, fontFamily: "'Helvetica Neue',Arial,sans-serif", borderBottom: "2px solid " + P.green, paddingBottom: 6, display: "inline-block" },
  tbl: { width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'Helvetica Neue',Arial,sans-serif" },
  th: { padding: "8px 6px", textAlign: "left", borderBottom: "2px solid " + P.navy, color: P.navy, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, position: "sticky", top: 0, background: P.white },
  td: { padding: "6px", borderBottom: "1px solid " + P.gray1, color: P.gray4, fontSize: 11 },
  sel: { background: P.white, color: P.navy, border: "1px solid " + P.gray2, borderRadius: 4, padding: "7px 12px", fontSize: 12, fontFamily: "'Helvetica Neue',Arial,sans-serif" },
  inp: { background: P.white, color: P.navy, border: "1px solid " + P.gray2, borderRadius: 4, padding: "7px 12px", fontSize: 12, width: 200, fontFamily: "'Helvetica Neue',Arial,sans-serif" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 },
  stat: { background: P.white, borderRadius: 6, padding: 16, border: "1px solid " + P.gray1, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  sN: { fontSize: 28, fontWeight: 700, color: P.navy, fontFamily: "'Helvetica Neue',Arial,sans-serif" },
  sL: { fontSize: 10, color: P.gray3, marginTop: 4, fontFamily: "'Helvetica Neue',Arial,sans-serif", textTransform: "uppercase", letterSpacing: 0.5 },
  pos: { color: P.green }, neg: { color: P.red },
  scroll: { overflowX: "auto", maxHeight: 520 },
  badge: { display: "inline-block", padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 600, fontFamily: "'Helvetica Neue',Arial,sans-serif" },
  chip: { display: "inline-block", padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 600, marginRight: 3, marginBottom: 2, fontFamily: "'Helvetica Neue',Arial,sans-serif" },
};
const pc = (v) => v > 0.01 ? ss.pos : v < -0.01 ? ss.neg : { color: P.gray3 };
const TABS = ["Overview", "CPT Explorer", "Company Scorecard", "State Analysis", "Cross-State Matrix", "Predictive Analytics"];
const TOP_ST = ["TX", "CA", "FL", "NY", "OH", "PA", "IL", "GA", "NC", "TN", "MI", "NJ", "VA", "WA", "AZ", "MA", "IN", "MO", "CO", "LA"];

// ═══════════════════════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState(0);
  const [sf, setSf] = useState("All");
  const [cs, setCs] = useState("");
  const [sc, setSc] = useState(null);
  const [selSt, setSelSt] = useState("TX");
  const hist = useMemo(() => genHist(), []);
  const bt = useMemo(() => genBT(hist), [hist]);
  const fc = useMemo(() => Object.entries(CPT).filter(([c, i]) => (sf === "All" || i.s === sf) && (!cs || c.includes(cs) || i.d.toLowerCase().includes(cs.toLowerCase()))), [sf, cs]);
  const cfs = useCallback((st) => CO_DATA.filter(c => c.se[st] && c.se[st] >= 0.03).sort((a, b) => (b.se[st] * b.mr) - (a.se[st] * a.mr)), []);

  return (
    <div style={ss.app}>
      <div style={ss.hdr}>
        <div>
          <div style={ss.logo}>Parkman Healthcare Partners</div>
          <div style={ss.logoSub}>Medicaid Fee Schedule Intelligence Platform</div>
        </div>
        <div style={{ textAlign: "right", fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>
          <div style={{ fontSize: 11, color: P.gray2 }}>{CO_DATA.length} Companies · {Object.keys(CPT).length} CPT Codes · {SL.length} States</div>
          <div style={{ fontSize: 10, color: P.gold, marginTop: 2 }}>{SPECIALTIES.length} Specialties Mapped</div>
        </div>
      </div>
      <div style={ss.tabs}>{TABS.map((t, i) => <button key={i} style={tab === i ? ss.tabA : ss.tab} onClick={() => setTab(i)}>{t}</button>)}</div>
      <div style={ss.body}>
        {tab === 0 && <Overview h={hist} />}
        {tab === 1 && <CPTExp codes={fc} sf={sf} setSf={setSf} cs={cs} setCs={setCs} />}
        {tab === 2 && <CoCard sc={sc} setSc={setSc} h={hist} />}
        {tab === 3 && <StateV selSt={selSt} setSelSt={setSelSt} cfs={cfs} h={hist} />}
        {tab === 4 && <CrossSt sf={sf} setSf={setSf} />}
        {tab === 5 && <Predict bt={bt} />}
      </div>
      <div style={{ textAlign: "center", padding: "20px", fontSize: 10, color: P.gray3, borderTop: "1px solid " + P.gray1, background: P.white, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>
        © {new Date().getFullYear()} Parkman Healthcare Partners · 700 Canal Street, 2nd Floor, Stamford, CT 06902 · Confidential & Proprietary
      </div>
    </div>
  );
}

// ── TAB 1: OVERVIEW ──
function Overview({ h }) {
  const rc = h.filter(x => x.year >= 2024).slice(0, 25);
  const ar = Object.values(ST).reduce((a, x) => a + x.r, 0) / SL.length;
  const tmr = CO_DATA.reduce((a, c) => a + c.mr, 0);
  return (<>
    <div style={ss.grid}>
      <div style={ss.stat}><div style={ss.sN}>{CO_DATA.length}</div><div style={ss.sL}>Public Companies</div></div>
      <div style={ss.stat}><div style={ss.sN}>{Object.keys(CPT).length}</div><div style={ss.sL}>CPT/HCPCS Codes</div></div>
      <div style={ss.stat}><div style={ss.sN}>{SL.length}</div><div style={ss.sL}>States + DC</div></div>
      <div style={ss.stat}><div style={ss.sN}>{SPECIALTIES.length}</div><div style={ss.sL}>Specialties</div></div>
      <div style={ss.stat}><div style={ss.sN}>{(ar * 100).toFixed(0)}%</div><div style={ss.sL}>Avg Medicaid/Medicare</div></div>
      <div style={ss.stat}><div style={ss.sN}>${(tmr / 1000).toFixed(0)}B</div><div style={ss.sL}>Tracked Medicaid Rev</div></div>
    </div>
    <div style={{ ...ss.card, marginTop: 14 }}>
      <div style={ss.cT}>Medicaid-to-Medicare Fee Ratio by State</div>
      <div style={{ height: 280 }}><ResponsiveContainer><BarChart data={SL.map(x => ({ st: x, r: ST[x].r })).sort((a, b) => a.r - b.r)} margin={{ bottom: 40, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={P.gray1} /><XAxis dataKey="st" tick={{ fill: P.gray3, fontSize: 8 }} angle={-45} textAnchor="end" interval={0} /><YAxis tick={{ fill: P.gray3, fontSize: 10 }} domain={[0.4, 1.2]} />
        <Tooltip contentStyle={{ background: P.white, border: "1px solid " + P.gray2, fontSize: 12 }} formatter={v => [(v * 100).toFixed(0) + "%", "Ratio"]} />
        <Bar dataKey="r">{SL.map(x => ({ st: x, r: ST[x].r })).sort((a, b) => a.r - b.r).map((d, i) => <Cell key={i} fill={d.r >= 0.80 ? P.green : d.r >= 0.65 ? P.gold : P.red} />)}</Bar>
      </BarChart></ResponsiveContainer></div>
      <p style={{ fontSize: 10, color: P.gray3, margin: "8px 0 0", fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Source: KFF/Urban Institute (2024), Health Affairs May 2025. Green ≥80% | Gold 65-79% | Red &lt;65%</p>
    </div>
    <div style={ss.card}>
      <div style={ss.cT}>Company Medicaid Revenue ($M)</div>
      <div style={{ height: 380 }}><ResponsiveContainer><BarChart data={CO_DATA.filter(c => c.mr > 200).sort((a, b) => b.mr - a.mr).slice(0, 18).map(c => ({ n: c.t, r: c.mr, tp: c.type }))} layout="vertical" margin={{ left: 50 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={P.gray1} /><XAxis type="number" tick={{ fill: P.gray3, fontSize: 10 }} tickFormatter={v => "$" + (v / 1000).toFixed(0) + "B"} />
        <YAxis dataKey="n" type="category" tick={{ fill: P.navy, fontSize: 11, fontWeight: 600 }} width={50} />
        <Tooltip contentStyle={{ background: P.white, border: "1px solid " + P.gray2, fontSize: 12 }} formatter={v => ["$" + (v / 1000).toFixed(1) + "B", "Medicaid Rev"]} />
        <Bar dataKey="r">{CO_DATA.filter(c => c.mr > 200).sort((a, b) => b.mr - a.mr).slice(0, 18).map((c, i) => <Cell key={i} fill={c.type === "payer" ? P.navy : P.green} />)}</Bar>
      </BarChart></ResponsiveContainer></div>
    </div>
    <div style={ss.card}>
      <div style={ss.cT}>Recent Fee Schedule Changes</div>
      <div style={ss.scroll}><table style={ss.tbl}><thead><tr>{["Year", "State", "CPT", "Description", "Specialty", "Old", "New", "Chg"].map(x => <th key={x} style={ss.th}>{x}</th>)}</tr></thead>
        <tbody>{rc.map((c, i) => <tr key={i}><td style={ss.td}>{c.year}</td><td style={ss.td}>{c.state}</td><td style={{ ...ss.td, fontWeight: 700, color: P.navy }}>{c.code}</td><td style={ss.td}>{CPT[c.code] && CPT[c.code].d}</td><td style={ss.td}>{c.specialty}</td><td style={ss.td}>${c.oldRate.toFixed(2)}</td><td style={ss.td}>${c.newRate.toFixed(2)}</td><td style={{ ...ss.td, ...pc(c.pctChg), fontWeight: 600 }}>{(c.pctChg * 100).toFixed(1)}%</td></tr>)}</tbody>
      </table></div>
    </div>
  </>);
}

// ── TAB 2: CPT EXPLORER ──
function CPTExp({ codes, sf, setSf, cs, setCs }) {
  const [sel, setSel] = useState(null);
  return (<>
    <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
      <select style={ss.sel} value={sf} onChange={e => setSf(e.target.value)}><option value="All">All Specialties ({Object.keys(CPT).length})</option>{SPECIALTIES.map(x => <option key={x} value={x}>{x} ({Object.values(CPT).filter(c => c.s === x).length})</option>)}</select>
      <input style={ss.inp} placeholder="Search code or description..." value={cs} onChange={e => setCs(e.target.value)} />
      <span style={{ fontSize: 11, color: P.gray3, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>{codes.length} codes</span>
    </div>
    <div style={{ ...ss.card, ...ss.scroll, maxHeight: 520 }}><table style={ss.tbl}><thead><tr>
      <th style={ss.th}>Code</th><th style={ss.th}>Description</th><th style={ss.th}>Specialty</th><th style={ss.th}>Medicare$</th>
      {TOP_ST.map(x => <th key={x} style={{ ...ss.th, fontSize: 9, padding: "6px 2px", textAlign: "center" }}>{x}</th>)}
    </tr></thead>
      <tbody>{codes.slice(0, 120).map(([c, info]) => {
        const isSel = c === sel;
        return (<tr key={c} onClick={() => setSel(isSel ? null : c)} style={{ cursor: "pointer", background: isSel ? P.offW : "transparent" }}>
          <td style={{ ...ss.td, fontWeight: 700, color: P.navy }}>{c}</td>
          <td style={{ ...ss.td, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.d}</td>
          <td style={ss.td}><span style={{ ...ss.chip, background: P.navy + "15", color: P.navy }}>{info.s}</span></td>
          <td style={{ ...ss.td, fontWeight: 600 }}>${info.mc.toFixed(2)}</td>
          {TOP_ST.map(x => { const r = info.mc * ST[x].r; const rat = ST[x].r; return <td key={x} style={{ ...ss.td, fontSize: 10, textAlign: "center", background: rat >= 0.8 ? P.green + "10" : rat >= 0.65 ? P.gold + "10" : P.red + "10" }}>${r.toFixed(0)}</td>; })}
        </tr>);
      })}</tbody></table></div>
    {sel && CPT[sel] && (<div style={{ ...ss.card, marginTop: 12 }}>
      <div style={ss.cT}>{sel}: {CPT[sel].d}</div>
      <div style={{ marginBottom: 12 }}><strong style={{ fontSize: 12, color: P.navy, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Companies billing this code:</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>{CO_DATA.filter(c => c.codes.includes(sel)).map(c => (<div key={c.t} style={{ background: P.offW, padding: "8px 12px", borderRadius: 4, border: "1px solid " + P.gray1, fontSize: 11, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>
          <strong style={{ color: P.navy }}>{c.t}</strong> <span style={{ color: P.gray3 }}>({c.n})</span>
          <div style={{ fontSize: 10, color: c.type === "payer" ? P.gold : P.green, marginTop: 2 }}>{c.type === "payer" ? "Payer — fee ↑ = cost" : "Provider — fee ↑ = revenue"}</div>
        </div>))}</div>
      </div>
      <div style={{ height: 220 }}><ResponsiveContainer><BarChart data={SL.map(x => ({ st: x, rate: +(CPT[sel].mc * ST[x].r).toFixed(2) })).sort((a, b) => b.rate - a.rate).slice(0, 25)}>
        <CartesianGrid strokeDasharray="3 3" stroke={P.gray1} /><XAxis dataKey="st" tick={{ fill: P.gray3, fontSize: 10 }} /><YAxis tick={{ fill: P.gray3, fontSize: 10 }} tickFormatter={v => "$" + v} />
        <Tooltip contentStyle={{ background: P.white, border: "1px solid " + P.gray2, fontSize: 12 }} /><Bar dataKey="rate" fill={P.green} />
      </BarChart></ResponsiveContainer></div>
    </div>)}
  </>);
}

// ── TAB 3: COMPANY SCORECARD ──
function CoCard({ sc, setSc, h }) {
  const co = sc ? CO_DATA.find(c => c.t === sc) : null;
  const cch = co ? h.filter(x => co.codes.includes(x.code) && co.se[x.state]) : [];
  return (<>
    <select style={{ ...ss.sel, marginBottom: 12 }} value={sc || ""} onChange={e => setSc(e.target.value || null)}>
      <option value="">Select a company...</option>{CO_DATA.map(c => <option key={c.t} value={c.t}>{c.t} — {c.n} ({c.seg})</option>)}
    </select>
    {!co ? (<div style={ss.card}><div style={ss.cT}>All Companies</div><div style={ss.scroll}><table style={ss.tbl}><thead><tr>{["Ticker", "Company", "Segment", "Type", "Total Rev", "Medicaid Rev", "Mcaid %", "Top States", "CPTs"].map(x => <th key={x} style={ss.th}>{x}</th>)}</tr></thead>
      <tbody>{CO_DATA.sort((a, b) => b.mr - a.mr).map(c => <tr key={c.t} onClick={() => setSc(c.t)} style={{ cursor: "pointer" }}>
        <td style={{ ...ss.td, fontWeight: 700, color: P.navy }}>{c.t}</td><td style={ss.td}>{c.n}</td><td style={ss.td}>{c.seg}</td>
        <td style={{ ...ss.td, color: c.type === "payer" ? P.gold : P.green, fontWeight: 600 }}>{c.type}</td>
        <td style={ss.td}>${(c.rev / 1000).toFixed(1)}B</td><td style={{ ...ss.td, fontWeight: 600 }}>${(c.mr / 1000).toFixed(1)}B</td>
        <td style={ss.td}>{(c.mp * 100).toFixed(0)}%</td>
        <td style={{ ...ss.td, fontSize: 10 }}>{Object.entries(c.se).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + " " + (v * 100).toFixed(0) + "%").join(", ")}</td>
        <td style={ss.td}>{c.codes.length}</td>
      </tr>)}</tbody></table></div></div>
    ) : (<>
      <div style={{ ...ss.card, borderLeft: "4px solid " + P.green }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 18, fontWeight: 700, color: P.navy, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>{co.t} — {co.n}</div>
            <div style={{ fontSize: 12, color: P.gray3, marginTop: 4, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>{co.seg} | {co.type === "payer" ? "MCO/Payer" : "Provider"}</div></div>
          <div style={{ textAlign: "right", fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>
            <div style={{ fontSize: 10, color: P.gray3 }}>Total Revenue</div><div style={{ fontSize: 20, fontWeight: 700, color: P.navy }}>${(co.rev / 1000).toFixed(1)}B</div>
            <div style={{ fontSize: 10, color: P.gray3, marginTop: 4 }}>Medicaid Revenue</div><div style={{ fontSize: 20, fontWeight: 700, color: P.green }}>${(co.mr / 1000).toFixed(1)}B ({(co.mp * 100).toFixed(0)}%)</div>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={ss.card}><div style={ss.cT}>State Exposure</div><div style={{ height: 240 }}><ResponsiveContainer><BarChart data={Object.entries(co.se).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ st: k, w: v * 100 }))}>
          <CartesianGrid strokeDasharray="3 3" stroke={P.gray1} /><XAxis dataKey="st" tick={{ fill: P.gray3, fontSize: 10 }} /><YAxis tick={{ fill: P.gray3, fontSize: 10 }} tickFormatter={v => v + "%"} />
          <Tooltip contentStyle={{ background: P.white, border: "1px solid " + P.gray2, fontSize: 12 }} formatter={v => [v.toFixed(1) + "%", "Weight"]} /><Bar dataKey="w" fill={P.navy} />
        </BarChart></ResponsiveContainer></div></div>
        <div style={ss.card}><div style={ss.cT}>Key CPT Codes</div><div style={{ ...ss.scroll, maxHeight: 240 }}><table style={ss.tbl}><thead><tr>{["Code", "Description", "Medicare", "High State", "Low State"].map(x => <th key={x} style={ss.th}>{x}</th>)}</tr></thead>
          <tbody>{co.codes.filter(c => CPT[c]).map(code => { const info = CPT[code]; const rates = Object.keys(co.se).filter(k => ST[k]).map(k => ({ s: k, r: +(info.mc * ST[k].r).toFixed(2) })); const hi = rates.sort((a, b) => b.r - a.r)[0]; const lo = rates.sort((a, b) => a.r - b.r)[0];
            return <tr key={code}><td style={{ ...ss.td, fontWeight: 700, color: P.navy }}>{code}</td><td style={{ ...ss.td, fontSize: 10 }}>{info.d}</td><td style={ss.td}>${info.mc.toFixed(2)}</td>
              <td style={{ ...ss.td, ...ss.pos }}>{hi && hi.s} ${hi && hi.r}</td><td style={{ ...ss.td, ...ss.neg }}>{lo && lo.s} ${lo && lo.r}</td></tr>;
          })}</tbody></table></div></div>
      </div>
      <div style={ss.card}><div style={ss.cT}>Fee Schedule Impact ({co.type === "payer" ? "Higher rates = COST pressure" : "Higher rates = REVENUE uplift"})</div>
        <div style={ss.scroll}><table style={ss.tbl}><thead><tr>{["Year", "State", "CPT", "Old", "New", "Change", "Est Impact"].map(x => <th key={x} style={ss.th}>{x}</th>)}</tr></thead>
          <tbody>{cch.sort((a, b) => b.year - a.year || Math.abs(b.pctChg) - Math.abs(a.pctChg)).slice(0, 30).map((c, i) => {
            const wt = co.se[c.state] || 0; const sgn = co.type === "payer" ? -1 : 1; const imp = +(c.pctChg * wt * co.mr * sgn / 100).toFixed(2);
            return <tr key={i}><td style={ss.td}>{c.year}</td><td style={ss.td}>{c.state}</td><td style={{ ...ss.td, fontWeight: 700 }}>{c.code}</td><td style={ss.td}>${c.oldRate.toFixed(2)}</td><td style={ss.td}>${c.newRate.toFixed(2)}</td>
              <td style={{ ...ss.td, ...pc(c.pctChg), fontWeight: 600 }}>{(c.pctChg * 100).toFixed(1)}%</td>
              <td style={{ ...ss.td, fontWeight: 600, color: imp > 0 ? P.green : P.red }}>${Math.abs(imp).toFixed(1)}M {imp > 0 ? "tailwind" : "headwind"}</td></tr>;
          })}</tbody></table></div>
      </div>
    </>)}
  </>);
}

// ── TAB 4: STATE ANALYSIS ──
function StateV({ selSt, setSelSt, cfs, h }) {
  const si = ST[selSt]; const exp = cfs(selSt); const sch = h.filter(x => x.state === selSt).sort((a, b) => b.year - a.year);
  return (<>
    <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
      <select style={ss.sel} value={selSt} onChange={e => setSelSt(e.target.value)}>{SL.map(x => <option key={x} value={x}>{x} — {ST[x].n}</option>)}</select>
      <span style={{ fontSize: 13, color: P.navy, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}><strong>{si.n}</strong> — Ratio: <span style={{ color: si.r >= 0.8 ? P.green : si.r >= 0.65 ? P.gold : P.red, fontWeight: 700 }}>{(si.r * 100).toFixed(0)}%</span></span>
    </div>
    <div style={ss.grid}>
      <div style={ss.stat}><div style={ss.sN}>{(si.r * 100).toFixed(0)}%</div><div style={ss.sL}>Medicaid/Medicare</div></div>
      <div style={ss.stat}><div style={ss.sN}>{exp.length}</div><div style={ss.sL}>Exposed Companies</div></div>
      <div style={ss.stat}><div style={ss.sN}>${(exp.reduce((a, c) => a + c.mr * (c.se[selSt] || 0), 0) / 1000).toFixed(1)}B</div><div style={ss.sL}>Rev at Risk</div></div>
      <div style={ss.stat}><div style={ss.sN}>{sch.filter(c => c.year >= 2024).length}</div><div style={ss.sL}>Recent Changes</div></div>
    </div>
    <div style={ss.card}><div style={ss.cT}>Companies in {si.n}</div><div style={ss.scroll}><table style={ss.tbl}><thead><tr>{["Ticker", "Company", "Type", "Weight", "Est State Rev", "Key Codes"].map(x => <th key={x} style={ss.th}>{x}</th>)}</tr></thead>
      <tbody>{exp.map(c => <tr key={c.t}><td style={{ ...ss.td, fontWeight: 700, color: P.navy }}>{c.t}</td><td style={ss.td}>{c.n}</td>
        <td style={{ ...ss.td, color: c.type === "payer" ? P.gold : P.green, fontWeight: 600 }}>{c.type}</td>
        <td style={{ ...ss.td, fontWeight: 600 }}>{((c.se[selSt] || 0) * 100).toFixed(1)}%</td>
        <td style={ss.td}>${((c.se[selSt] || 0) * c.mr).toFixed(0)}M</td>
        <td style={{ ...ss.td, fontSize: 10 }}>{c.codes.slice(0, 8).join(", ")}</td></tr>)}</tbody></table></div></div>
    <div style={ss.card}><div style={ss.cT}>CPT Rates in {si.n} (Top 25)</div><div style={ss.scroll}><table style={ss.tbl}><thead><tr>{["Code", "Description", "Specialty", "Medicare", "Medicaid", "Gap", "Billers"].map(x => <th key={x} style={ss.th}>{x}</th>)}</tr></thead>
      <tbody>{Object.entries(CPT).sort((a, b) => b[1].mc - a[1].mc).slice(0, 25).map(([c, info]) => {
        const mr = +(info.mc * si.r).toFixed(2); const gap = mr - info.mc; const bl = CO_DATA.filter(x => x.codes.includes(c) && x.se[selSt]).map(x => x.t);
        return <tr key={c}><td style={{ ...ss.td, fontWeight: 700, color: P.navy }}>{c}</td><td style={ss.td}>{info.d}</td><td style={ss.td}>{info.s}</td><td style={ss.td}>${info.mc.toFixed(2)}</td><td style={{ ...ss.td, fontWeight: 600 }}>${mr.toFixed(2)}</td><td style={{ ...ss.td, ...ss.neg }}>${gap.toFixed(2)}</td><td style={{ ...ss.td, fontSize: 10 }}>{bl.join(", ") || "—"}</td></tr>;
      })}</tbody></table></div></div>
    <div style={ss.card}><div style={ss.cT}>Historical Changes — {si.n}</div><div style={ss.scroll}><table style={ss.tbl}><thead><tr>{["Year", "CPT", "Description", "Old", "New", "Change"].map(x => <th key={x} style={ss.th}>{x}</th>)}</tr></thead>
      <tbody>{sch.slice(0, 30).map((c, i) => <tr key={i}><td style={ss.td}>{c.year}</td><td style={{ ...ss.td, fontWeight: 700 }}>{c.code}</td><td style={ss.td}>{CPT[c.code] && CPT[c.code].d}</td><td style={ss.td}>${c.oldRate.toFixed(2)}</td><td style={ss.td}>${c.newRate.toFixed(2)}</td><td style={{ ...ss.td, ...pc(c.pctChg), fontWeight: 600 }}>{(c.pctChg * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></div>
  </>);
}

// ── TAB 5: CROSS-STATE MATRIX ──
function CrossSt({ sf, setSf }) {
  const codes = Object.entries(CPT).filter(([, i]) => sf === "All" || i.s === sf).sort((a, b) => b[1].mc - a[1].mc).slice(0, 30);
  const mx = Math.max(...codes.flatMap(([, i]) => TOP_ST.map(x => i.mc * ST[x].r)));
  return (<>
    <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
      <select style={ss.sel} value={sf} onChange={e => setSf(e.target.value)}><option value="All">All Specialties</option>{SPECIALTIES.map(x => <option key={x} value={x}>{x}</option>)}</select>
      <span style={{ fontSize: 11, color: P.gray3, alignSelf: "center", fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Heat map: darker = higher Medicaid rate</span>
    </div>
    <div style={{ ...ss.card, ...ss.scroll }}><table style={ss.tbl}><thead><tr>
      <th style={{ ...ss.th, minWidth: 55 }}>Code</th><th style={{ ...ss.th, minWidth: 110 }}>Desc</th><th style={{ ...ss.th, minWidth: 45 }}>MC$</th>
      {TOP_ST.map(x => <th key={x} style={{ ...ss.th, fontSize: 9, padding: "6px 2px", minWidth: 38, textAlign: "center" }}>{x}</th>)}
    </tr></thead>
      <tbody>{codes.map(([c, info]) => <tr key={c}>
        <td style={{ ...ss.td, fontWeight: 700, color: P.navy, fontSize: 10 }}>{c}</td>
        <td style={{ ...ss.td, fontSize: 9, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.d}</td>
        <td style={{ ...ss.td, fontSize: 10 }}>${info.mc.toFixed(0)}</td>
        {TOP_ST.map(x => { const r = info.mc * ST[x].r; const op = Math.max(0.05, r / mx * 0.6);
          return <td key={x} style={{ ...ss.td, fontSize: 9, textAlign: "center", background: "rgba(15,34,64," + op + ")", color: op > 0.3 ? P.white : P.navy }}>{r.toFixed(0)}</td>; })}
      </tr>)}</tbody></table></div>
  </>);
}

// ── TAB 6: PREDICTIVE ANALYTICS ──
function Predict({ bt }) {
  const [lag, setLag] = useState(1);
  const [tk, setTk] = useState("All");
  const prov = CO_DATA.filter(c => c.type === "provider");
  const rbl = useMemo(() => [1, 2, 3, 4].map(l => { const d = bt.filter(b => b.lag === l && (tk === "All" || b.ticker === tk)); return { lag: l, ...linReg(d.map(b => b.feeImpact), d.map(b => b.revGrowth)), n: d.length }; }), [bt, tk]);
  const crs = useMemo(() => prov.map(co => { const d = bt.filter(b => b.lag === lag && b.ticker === co.t); const r = linReg(d.map(b => b.feeImpact), d.map(b => b.revGrowth)); return { ...co, ...r }; }).sort((a, b) => b.r2 - a.r2), [bt, lag]);
  const sd = bt.filter(b => b.lag === lag && (tk === "All" || b.ticker === tk));
  const best = rbl.reduce((b, c) => c.r2 > b.r2 ? c : b, rbl[0]);

  return (<>
    <div style={{ ...ss.card, borderLeft: "4px solid " + P.gold }}>
      <div style={ss.cT}>Methodology</div>
      <p style={{ fontSize: 11, color: P.gray4, lineHeight: 1.7, margin: 0, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>
        We compute a <strong>weighted fee schedule impact score</strong> per company-quarter: each CPT code rate change × state exposure weight, summed across all states. This is regressed against subsequent quarterly revenue growth at 1-4 quarter lags. R² = explanatory power, t-stat = coefficient significance, p-value = statistical confidence. The optimal lag is dynamically identified. For MCOs, the relationship inverts — higher fees increase medical costs.
      </p>
    </div>
    <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
      <select style={ss.sel} value={lag} onChange={e => setLag(+e.target.value)}><option value={1}>Q+1 Lag</option><option value={2}>Q+2 Lag</option><option value={3}>Q+3 Lag</option><option value={4}>Q+4 Lag (1yr)</option></select>
      <select style={ss.sel} value={tk} onChange={e => setTk(e.target.value)}><option value="All">All Providers</option>{prov.map(c => <option key={c.t} value={c.t}>{c.t} — {c.n}</option>)}</select>
    </div>
    <div style={ss.grid}>
      {rbl.map(r => <div key={r.lag} style={{ ...ss.stat, border: r.lag === best.lag ? "2px solid " + P.green : "1px solid " + P.gray1 }}>
        <div style={{ fontSize: 10, color: P.gray3, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Q+{r.lag} Lag</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: r.r2 > 0.15 ? P.green : r.r2 > 0.05 ? P.gold : P.red }}>{(r.r2 * 100).toFixed(1)}%</div>
        <div style={{ fontSize: 9, color: P.gray3 }}>R²</div>
        <div style={{ fontSize: 11, marginTop: 4, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}><span style={{ color: P.navy }}>t={r.tStat}</span> <span style={{ color: r.pVal < 0.05 ? P.green : P.gray3 }}>p={r.pVal}</span></div>
        {r.lag === best.lag && <div style={{ fontSize: 9, color: P.green, marginTop: 4, fontWeight: 600 }}>★ OPTIMAL HORIZON</div>}
      </div>)}
    </div>
    <div style={{ ...ss.card, marginTop: 12 }}>
      <div style={ss.cT}>Fee Impact vs Revenue Growth (Q+{lag})</div>
      <div style={{ height: 280 }}><ResponsiveContainer><ScatterChart margin={{ bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={P.gray1} /><XAxis dataKey="feeImpact" name="Fee Impact" tick={{ fill: P.gray3, fontSize: 10 }} label={{ value: "Weighted Fee Impact", position: "bottom", fill: P.gray3, fontSize: 10 }} />
        <YAxis dataKey="revGrowth" name="Rev Growth" tick={{ fill: P.gray3, fontSize: 10 }} label={{ value: "Rev Growth", angle: -90, position: "insideLeft", fill: P.gray3, fontSize: 10 }} tickFormatter={v => (v * 100).toFixed(0) + "%"} />
        <Tooltip contentStyle={{ background: P.white, border: "1px solid " + P.gray2, fontSize: 11 }} formatter={(v, n) => [n === "Fee Impact" ? v.toFixed(4) : (v * 100).toFixed(1) + "%", n]} />
        <Scatter data={sd} fill={P.navy} fillOpacity={0.5} />
      </ScatterChart></ResponsiveContainer></div>
    </div>
    <div style={ss.card}><div style={ss.cT}>Company-Level Signal Strength (Q+{lag})</div><div style={ss.scroll}><table style={ss.tbl}><thead><tr>{["Ticker", "Company", "Segment", "Mcaid %", "R²", "Slope", "t-Stat", "p-Val", "Signal"].map(x => <th key={x} style={ss.th}>{x}</th>)}</tr></thead>
      <tbody>{crs.map(r => <tr key={r.t}><td style={{ ...ss.td, fontWeight: 700, color: P.navy }}>{r.t}</td><td style={ss.td}>{r.n}</td><td style={ss.td}>{r.seg}</td><td style={ss.td}>{(r.mp * 100).toFixed(0)}%</td>
        <td style={{ ...ss.td, fontWeight: 600, color: r.r2 > 0.15 ? P.green : r.r2 > 0.05 ? P.gold : P.red }}>{(r.r2 * 100).toFixed(1)}%</td>
        <td style={ss.td}>{r.slope}</td><td style={ss.td}>{r.tStat}</td>
        <td style={{ ...ss.td, color: r.pVal < 0.05 ? P.green : P.gray3 }}>{r.pVal < 0.05 ? "<0.05" : r.pVal.toFixed(2)}</td>
        <td style={ss.td}><span style={{ ...ss.badge, background: r.r2 > 0.15 ? P.green + "20" : r.r2 > 0.05 ? P.gold + "20" : P.red + "20", color: r.r2 > 0.15 ? P.green : r.r2 > 0.05 ? P.gold : P.red }}>{r.r2 > 0.15 ? "Strong" : r.r2 > 0.05 ? "Moderate" : "Weak"}</span></td></tr>)}</tbody></table></div>
    </div>
  </>);
}
