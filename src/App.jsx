import { useState, useMemo, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, Cell, PieChart, Pie, Legend } from "recharts";

// ═══════════════════════════════════════
// PARKMAN BRAND — Green-dominant palette
// ═══════════════════════════════════════
const P={green:"#2A7D5F",greenD:"#1F5C45",greenL:"#34A073",greenXL:"#E8F5EE",navy:"#0F2240",navy2:"#162D52",gold:"#C5975B",goldL:"#D4AD7A",white:"#FFFFFF",offW:"#F7F8FA",g1:"#E8EBF0",g2:"#C5CBD6",g3:"#8B95A5",g4:"#5A6577",bg:"#F2F4F7",red:"#C0392B",redL:"#E74C3C"};
const hf="'Helvetica Neue',Arial,sans-serif";

// ═══════════════════════════════════════
// 220+ CPT/HCPCS CODES
// ═══════════════════════════════════════
const CPT={
"99202":{d:"Office new, straightforward",s:"E&M Office",mc:72.43},"99203":{d:"Office new, low complexity",s:"E&M Office",mc:112.40},"99204":{d:"Office new, moderate",s:"E&M Office",mc:172.18},"99205":{d:"Office new, high complexity",s:"E&M Office",mc:218.85},
"99211":{d:"Office est, minimal",s:"E&M Office",mc:27.18},"99212":{d:"Office est, straightforward",s:"E&M Office",mc:58.53},"99213":{d:"Office est, low complexity",s:"E&M Office",mc:92.15},"99214":{d:"Office est, moderate",s:"E&M Office",mc:132.29},"99215":{d:"Office est, high complexity",s:"E&M Office",mc:181.54},
"99381":{d:"Preventive new, infant",s:"E&M Office",mc:98.50},"99382":{d:"Preventive new, age 1-4",s:"E&M Office",mc:105.22},"99383":{d:"Preventive new, age 5-11",s:"E&M Office",mc:103.40},"99384":{d:"Preventive new, age 12-17",s:"E&M Office",mc:118.60},"99385":{d:"Preventive new, age 18-39",s:"E&M Office",mc:112.85},"99386":{d:"Preventive new, age 40-64",s:"E&M Office",mc:131.73},
"99391":{d:"Preventive est, infant",s:"E&M Office",mc:88.15},"99392":{d:"Preventive est, age 1-4",s:"E&M Office",mc:95.30},"99393":{d:"Preventive est, age 5-11",s:"E&M Office",mc:92.18},"99394":{d:"Preventive est, age 12-17",s:"E&M Office",mc:104.55},"99395":{d:"Preventive est, age 18-39",s:"E&M Office",mc:105.42},"99396":{d:"Preventive est, age 40-64",s:"E&M Office",mc:118.90},
"99221":{d:"Initial hospital, straightforward",s:"E&M Hospital",mc:133.71},"99222":{d:"Initial hospital, moderate",s:"E&M Hospital",mc:176.88},"99223":{d:"Initial hospital, high",s:"E&M Hospital",mc:254.67},"99231":{d:"Subsequent hospital, straightforward",s:"E&M Hospital",mc:48.91},"99232":{d:"Subsequent hospital, moderate",s:"E&M Hospital",mc:88.72},"99233":{d:"Subsequent hospital, high",s:"E&M Hospital",mc:128.47},
"99234":{d:"Obs/inpatient same date, straightforward",s:"E&M Hospital",mc:187.32},"99235":{d:"Obs/inpatient same date, moderate",s:"E&M Hospital",mc:252.18},"99236":{d:"Obs/inpatient same date, high",s:"E&M Hospital",mc:312.44},"99238":{d:"Hospital discharge, ≤30 min",s:"E&M Hospital",mc:82.55},"99239":{d:"Hospital discharge, >30 min",s:"E&M Hospital",mc:118.30},
"99291":{d:"Critical care, first 30-74 min",s:"Critical Care",mc:286.14},"99292":{d:"Critical care, each addl 30 min",s:"Critical Care",mc:127.68},
"99281":{d:"ED visit, self-limited",s:"Emergency",mc:30.42},"99282":{d:"ED visit, low complexity",s:"Emergency",mc:56.18},"99283":{d:"ED visit, moderate",s:"Emergency",mc:88.35},"99284":{d:"ED visit, moderate-high",s:"Emergency",mc:148.22},"99285":{d:"ED visit, high complexity",s:"Emergency",mc:212.63},
"99441":{d:"Telephone E&M, 5-10 min",s:"Telehealth",mc:28.65},"99442":{d:"Telephone E&M, 11-20 min",s:"Telehealth",mc:56.32},"99443":{d:"Telephone E&M, 21-30 min",s:"Telehealth",mc:82.18},
"99341":{d:"Home visit new, straightforward",s:"Home Visit",mc:73.52},"99342":{d:"Home visit new, low",s:"Home Visit",mc:115.88},"99343":{d:"Home visit new, moderate",s:"Home Visit",mc:170.45},"99344":{d:"Home visit new, high",s:"Home Visit",mc:247.30},"99347":{d:"Home visit est, straightforward",s:"Home Visit",mc:52.15},"99348":{d:"Home visit est, low",s:"Home Visit",mc:88.90},"99349":{d:"Home visit est, moderate",s:"Home Visit",mc:132.75},"99350":{d:"Home visit est, high",s:"Home Visit",mc:188.60},
"99304":{d:"SNF initial, straightforward",s:"SNF",mc:110.82},"99305":{d:"SNF initial, moderate",s:"SNF",mc:149.55},"99306":{d:"SNF initial, high",s:"SNF",mc:191.43},"99307":{d:"SNF subsequent, straightforward",s:"SNF",mc:40.18},"99308":{d:"SNF subsequent, low",s:"SNF",mc:72.91},"99309":{d:"SNF subsequent, moderate",s:"SNF",mc:107.65},"99310":{d:"SNF subsequent, high",s:"SNF",mc:153.28},
"97110":{d:"Therapeutic exercises, 15 min",s:"Rehab/PT",mc:33.12},"97112":{d:"Neuromuscular re-education",s:"Rehab/PT",mc:36.45},"97113":{d:"Aquatic therapy, 15 min",s:"Rehab/PT",mc:34.55},"97116":{d:"Gait training, 15 min",s:"Rehab/PT",mc:30.87},"97140":{d:"Manual therapy, 15 min",s:"Rehab/PT",mc:31.55},"97530":{d:"Therapeutic activities, 15 min",s:"Rehab/PT",mc:35.21},"97535":{d:"Self-care/home mgmt training",s:"Rehab/PT",mc:34.80},"97150":{d:"Group therapy, 15 min",s:"Rehab/PT",mc:16.42},
"97161":{d:"PT evaluation, low",s:"Rehab/PT",mc:92.18},"97162":{d:"PT evaluation, moderate",s:"Rehab/PT",mc:92.18},"97163":{d:"PT evaluation, high",s:"Rehab/PT",mc:92.18},"97164":{d:"PT re-evaluation",s:"Rehab/PT",mc:52.70},"97165":{d:"OT evaluation, low",s:"Rehab/PT",mc:88.35},"97166":{d:"OT evaluation, moderate",s:"Rehab/PT",mc:88.35},"97167":{d:"OT evaluation, high",s:"Rehab/PT",mc:88.35},
"92507":{d:"Speech/language treatment",s:"Rehab/PT",mc:44.28},"92521":{d:"Eval of speech fluency",s:"Rehab/PT",mc:95.65},"92523":{d:"Speech sound lang eval",s:"Rehab/PT",mc:129.15},
"90791":{d:"Psychiatric diagnostic eval",s:"Behavioral",mc:152.80},"90792":{d:"Psychiatric eval w/ medical",s:"Behavioral",mc:182.45},"90832":{d:"Psychotherapy, 30 min",s:"Behavioral",mc:68.22},"90834":{d:"Psychotherapy, 45 min",s:"Behavioral",mc:96.38},"90837":{d:"Psychotherapy, 60 min",s:"Behavioral",mc:131.72},"90839":{d:"Psychotherapy crisis, first 60 min",s:"Behavioral",mc:158.90},"90840":{d:"Psychotherapy crisis addl 30 min",s:"Behavioral",mc:78.45},
"90846":{d:"Family therapy w/o patient",s:"Behavioral",mc:106.55},"90847":{d:"Family therapy w/ patient",s:"Behavioral",mc:112.85},"90853":{d:"Group psychotherapy",s:"Behavioral",mc:35.18},"90862":{d:"Medication management",s:"Behavioral",mc:45.52},
"H0015":{d:"Intensive outpatient program",s:"Behavioral",mc:85.00},"H0020":{d:"Alcohol/drug services per diem",s:"Behavioral",mc:62.00},"H0031":{d:"Mental health assessment",s:"Behavioral",mc:68.50},"H0036":{d:"Community psychiatric support",s:"Behavioral",mc:38.25},"H2011":{d:"Crisis intervention per 15 min",s:"Behavioral",mc:24.35},"H2012":{d:"BH day treatment per hr",s:"Behavioral",mc:32.18},"H2014":{d:"Skills training per 15 min",s:"Behavioral",mc:18.90},"H2017":{d:"Psychosocial rehab per 15 min",s:"Behavioral",mc:16.80},
"96116":{d:"Neurobehavioral status exam 1st hr",s:"Behavioral",mc:108.72},"96121":{d:"Neurobehavioral status exam addl hr",s:"Behavioral",mc:95.40},
"90935":{d:"Hemodialysis, single eval",s:"Dialysis",mc:87.45},"90937":{d:"Hemodialysis, repeat eval",s:"Dialysis",mc:110.22},"90940":{d:"Hemodialysis access cannulation",s:"Dialysis",mc:42.30},"90945":{d:"Dialysis non-hemo single",s:"Dialysis",mc:87.45},"90947":{d:"Dialysis non-hemo repeat",s:"Dialysis",mc:110.22},
"90960":{d:"ESRD monthly 4+ visits age 20+",s:"Dialysis",mc:269.87},"90961":{d:"ESRD monthly 2-3 visits 20+",s:"Dialysis",mc:232.15},"90962":{d:"ESRD monthly 1 visit 20+",s:"Dialysis",mc:179.90},"90966":{d:"ESRD home dialysis monthly",s:"Dialysis",mc:144.32},"90970":{d:"ESRD home dialysis addl/day",s:"Dialysis",mc:9.85},
"36415":{d:"Venipuncture, routine",s:"Lab",mc:3.02},"80048":{d:"Basic metabolic panel",s:"Lab",mc:8.68},"80053":{d:"Comprehensive metabolic panel",s:"Lab",mc:11.22},"80061":{d:"Lipid panel",s:"Lab",mc:13.39},"80076":{d:"Hepatic function panel",s:"Lab",mc:10.02},
"81001":{d:"Urinalysis w/ microscopy",s:"Lab",mc:3.89},"82947":{d:"Glucose, quantitative",s:"Lab",mc:4.52},"83036":{d:"Hemoglobin A1c",s:"Lab",mc:11.23},"84443":{d:"TSH",s:"Lab",mc:18.18},"85025":{d:"CBC w/ diff",s:"Lab",mc:7.77},"85027":{d:"CBC automated",s:"Lab",mc:6.55},"85610":{d:"Prothrombin time",s:"Lab",mc:4.88},
"86580":{d:"TB skin test",s:"Lab",mc:5.65},"86803":{d:"Hepatitis C antibody",s:"Lab",mc:16.55},"86900":{d:"Blood typing ABO",s:"Lab",mc:4.49},"87081":{d:"Culture bacterial screening",s:"Lab",mc:8.86},"87491":{d:"Chlamydia nucleic acid",s:"Lab",mc:35.09},"87591":{d:"Gonorrhoeae nucleic acid",s:"Lab",mc:35.09},"87804":{d:"Influenza rapid test",s:"Lab",mc:15.42},"87880":{d:"Strep A rapid test",s:"Lab",mc:14.68},
"88305":{d:"Surgical pathology gross/micro",s:"Lab",mc:70.82},"88342":{d:"Immunohistochemistry",s:"Lab",mc:72.68},
"20610":{d:"Arthrocentesis major joint",s:"MSK/Surgery",mc:52.85},"27130":{d:"Total hip arthroplasty",s:"MSK/Surgery",mc:1478.15},"27447":{d:"Total knee arthroplasty",s:"MSK/Surgery",mc:1395.52},"27236":{d:"Femoral neck fracture ORIF",s:"MSK/Surgery",mc:1052.30},"27244":{d:"Intertrochanteric femoral fx",s:"MSK/Surgery",mc:985.42},
"29880":{d:"Knee arthroscopy meniscus repair",s:"MSK/Surgery",mc:588.45},"29881":{d:"Knee arthroscopy meniscectomy",s:"MSK/Surgery",mc:508.70},"29826":{d:"Shoulder arthroscopy decompression",s:"MSK/Surgery",mc:475.82},"29827":{d:"Shoulder arthroscopy rotator cuff",s:"MSK/Surgery",mc:742.55},
"22551":{d:"Anterior cervical discectomy/fusion",s:"MSK/Surgery",mc:1425.60},"22612":{d:"Posterior lumbar fusion",s:"MSK/Surgery",mc:1285.70},"63030":{d:"Lumbar laminotomy/discectomy",s:"MSK/Surgery",mc:855.40},"62323":{d:"Lumbar epidural injection",s:"MSK/Surgery",mc:112.85},"64483":{d:"Transforaminal epidural lumbar",s:"MSK/Surgery",mc:152.45},"64493":{d:"Facet joint injection lumbar",s:"MSK/Surgery",mc:105.80},
"47562":{d:"Lap cholecystectomy",s:"General Surgery",mc:587.12},"44970":{d:"Lap appendectomy",s:"General Surgery",mc:518.55},"49505":{d:"Inguinal hernia repair",s:"General Surgery",mc:468.42},"43239":{d:"Upper GI endoscopy w/ biopsy",s:"General Surgery",mc:233.28},"45378":{d:"Diagnostic colonoscopy",s:"General Surgery",mc:282.40},"45380":{d:"Colonoscopy w/ biopsy",s:"General Surgery",mc:318.75},"45385":{d:"Colonoscopy w/ polypectomy",s:"General Surgery",mc:362.85},
"66984":{d:"Cataract surgery phaco w/ IOL",s:"Ophthalmology",mc:567.43},"67028":{d:"Intravitreal injection",s:"Ophthalmology",mc:85.22},"92004":{d:"Ophthalmic exam new comprehensive",s:"Ophthalmology",mc:128.45},"92014":{d:"Ophthalmic exam est comprehensive",s:"Ophthalmology",mc:92.30},
"52000":{d:"Cystourethroscopy",s:"Urology",mc:168.35},"52234":{d:"Cystourethroscopy tumor treatment sm",s:"Urology",mc:295.67},"52310":{d:"Cystourethroscopy stent removal",s:"Urology",mc:247.82},"51798":{d:"Post-void residual measurement",s:"Urology",mc:14.28},
"71046":{d:"Chest X-ray 2 views",s:"Imaging",mc:22.78},"74177":{d:"CT abd/pelvis w/ contrast",s:"Imaging",mc:255.32},"74176":{d:"CT abd/pelvis w/o contrast",s:"Imaging",mc:192.55},"70553":{d:"MRI brain w/ and w/o contrast",s:"Imaging",mc:376.45},"72148":{d:"MRI lumbar spine w/o contrast",s:"Imaging",mc:265.18},"73721":{d:"MRI knee w/o contrast",s:"Imaging",mc:265.88},"73221":{d:"MRI shoulder w/o contrast",s:"Imaging",mc:268.42},
"77067":{d:"Screening mammography bilateral",s:"Imaging",mc:104.88},"77063":{d:"Screening breast tomosynthesis",s:"Imaging",mc:46.12},"76700":{d:"US abdomen complete",s:"Imaging",mc:98.30},"76805":{d:"OB US fetal/maternal eval",s:"Imaging",mc:118.55},"93000":{d:"ECG 12-lead w/ interp",s:"Imaging",mc:16.42},"93306":{d:"Echocardiography TTE complete",s:"Imaging",mc:115.35},
"93451":{d:"Right heart catheterization",s:"Cardiology",mc:332.50},"93452":{d:"Left heart catheterization",s:"Cardiology",mc:455.80},"93458":{d:"Left heart cath w/ angiography",s:"Cardiology",mc:568.42},"93015":{d:"Cardiovascular stress test",s:"Cardiology",mc:92.85},"93350":{d:"Stress echocardiography",s:"Cardiology",mc:135.20},
"G0299":{d:"Skilled nursing home health",s:"Home Health",mc:72.50},"G0151":{d:"Home health PT services",s:"Home Health",mc:68.35},"G0152":{d:"Home health OT services",s:"Home Health",mc:66.12},"G0153":{d:"Home health SLP services",s:"Home Health",mc:78.40},"G0156":{d:"Home health aide services",s:"Home Health",mc:28.15},"G0157":{d:"Home health PT assistant",s:"Home Health",mc:48.55},
"T1019":{d:"Personal care services 15 min",s:"Home Health",mc:18.25},"T1020":{d:"Personal care per diem",s:"Home Health",mc:145.60},"T1030":{d:"Nursing care home RN 15 min",s:"Home Health",mc:22.85},"T1031":{d:"Nursing care home LPN 15 min",s:"Home Health",mc:16.45},"S5125":{d:"Attendant care 15 min",s:"Home Health",mc:14.50},"S5130":{d:"Homemaker service 15 min",s:"Home Health",mc:11.80},
"T2042":{d:"Hospice routine home care/diem",s:"Hospice",mc:211.35},"T2043":{d:"Hospice continuous home care/hr",s:"Hospice",mc:62.15},"T2044":{d:"Hospice inpatient respite/diem",s:"Hospice",mc:480.22},"T2045":{d:"Hospice general inpatient/diem",s:"Hospice",mc:1068.55},
"96365":{d:"IV infusion therapy 1st hr",s:"Infusion",mc:138.22},"96366":{d:"IV infusion addl hr",s:"Infusion",mc:33.85},"96374":{d:"IV push single substance",s:"Infusion",mc:57.33},"96413":{d:"Chemo IV infusion 1st hr",s:"Infusion",mc:168.75},"96415":{d:"Chemo IV infusion addl hr",s:"Infusion",mc:38.90},
"D0120":{d:"Periodic oral evaluation",s:"Dental",mc:38.50},"D0150":{d:"Comprehensive oral evaluation",s:"Dental",mc:62.85},"D0210":{d:"Full mouth X-rays",s:"Dental",mc:94.20},"D1110":{d:"Prophylaxis adult",s:"Dental",mc:72.50},"D1120":{d:"Prophylaxis child",s:"Dental",mc:48.80},"D1206":{d:"Topical fluoride varnish",s:"Dental",mc:28.35},"D1351":{d:"Sealant per tooth",s:"Dental",mc:38.90},
"D2140":{d:"Amalgam filling 1 surface",s:"Dental",mc:88.40},"D2330":{d:"Resin filling 1 surface anterior",s:"Dental",mc:95.72},"D2750":{d:"Crown porcelain/ceramic",s:"Dental",mc:685.00},"D3310":{d:"Root canal anterior",s:"Dental",mc:498.50},"D3330":{d:"Root canal molar",s:"Dental",mc:728.15},"D7140":{d:"Extraction erupted tooth",s:"Dental",mc:128.40},"D7210":{d:"Extraction surgical erupted",s:"Dental",mc:198.55},"D7240":{d:"Extraction impacted tooth",s:"Dental",mc:312.80},
"59400":{d:"Routine OB care vaginal delivery",s:"OB/GYN",mc:2285.00},"59510":{d:"Routine OB care cesarean",s:"OB/GYN",mc:2668.00},"59025":{d:"Fetal non-stress test",s:"OB/GYN",mc:42.15},"58100":{d:"Endometrial biopsy",s:"OB/GYN",mc:108.22},"58571":{d:"Lap hysterectomy uterus >250g",s:"OB/GYN",mc:1048.30},
"E0601":{d:"CPAP device",s:"DME",mc:85.42},"E1390":{d:"Oxygen concentrator",s:"DME",mc:92.18},"K0001":{d:"Standard wheelchair",s:"DME",mc:112.50},"K0823":{d:"Power wheelchair group 2",s:"DME",mc:2850.00},
"A0427":{d:"ALS emergency transport",s:"Ambulance",mc:482.35},"A0429":{d:"BLS emergency transport",s:"Ambulance",mc:385.42},"A0428":{d:"BLS non-emergency transport",s:"Ambulance",mc:262.80},"A0425":{d:"Ground mileage per mile",s:"Ambulance",mc:7.52},
};
const SPECS=[...new Set(Object.values(CPT).map(c=>c.s))].sort();

// ALL 50 STATES + DC — Medicaid/Medicare ratios (KFF/Urban Institute 2024)
const ST={AL:{n:"Alabama",r:.71},AK:{n:"Alaska",r:1.13},AZ:{n:"Arizona",r:.72},AR:{n:"Arkansas",r:.74},CA:{n:"California",r:.54},CO:{n:"Colorado",r:.75},CT:{n:"Connecticut",r:.72},DE:{n:"Delaware",r:.85},FL:{n:"Florida",r:.62},GA:{n:"Georgia",r:.63},HI:{n:"Hawaii",r:.80},ID:{n:"Idaho",r:.72},IL:{n:"Illinois",r:.53},IN:{n:"Indiana",r:.68},IA:{n:"Iowa",r:.80},KS:{n:"Kansas",r:.67},KY:{n:"Kentucky",r:.71},LA:{n:"Louisiana",r:.76},ME:{n:"Maine",r:1.00},MD:{n:"Maryland",r:.74},MA:{n:"Massachusetts",r:.65},MI:{n:"Michigan",r:.61},MN:{n:"Minnesota",r:.70},MS:{n:"Mississippi",r:.65},MO:{n:"Missouri",r:.60},MT:{n:"Montana",r:.82},NE:{n:"Nebraska",r:.84},NV:{n:"Nevada",r:.63},NH:{n:"New Hampshire",r:.69},NJ:{n:"New Jersey",r:.51},NM:{n:"New Mexico",r:.76},NY:{n:"New York",r:.52},NC:{n:"North Carolina",r:.77},ND:{n:"North Dakota",r:.95},OH:{n:"Ohio",r:.64},OK:{n:"Oklahoma",r:.69},OR:{n:"Oregon",r:.80},PA:{n:"Pennsylvania",r:.59},RI:{n:"Rhode Island",r:.70},SC:{n:"South Carolina",r:.72},SD:{n:"South Dakota",r:.85},TN:{n:"Tennessee",r:.73},TX:{n:"Texas",r:.62},UT:{n:"Utah",r:.74},VT:{n:"Vermont",r:.70},VA:{n:"Virginia",r:.72},WA:{n:"Washington",r:.80},WV:{n:"West Virginia",r:.70},WI:{n:"Wisconsin",r:.75},WY:{n:"Wyoming",r:.87},DC:{n:"District of Columbia",r:.73}};
const SL=Object.keys(ST).sort();

// 26 COMPANIES — SEC 10-K/10-Q FY2024 & Q3 2025
// rev = total annual revenue ($M), mr = estimated annual Medicaid revenue ($M)
// Source: Company 10-K annual reports filed with SEC, supplemented by quarterly earnings releases
const COS=[
{t:"CNC",n:"Centene",seg:"MCO",mp:.52,rev:171000,mr:88920,se:{TX:.11,FL:.09,CA:.08,GA:.06,OH:.05,IN:.05,IL:.05,WA:.04,MS:.04,LA:.04,KS:.03,NH:.03,WI:.03,AR:.03,AZ:.03,NC:.03,MO:.03,NE:.02,SC:.02,NY:.02},codes:["99213","99214","99215","99284","99285","90834","90837","97110","90960","80053","85025","99392","D1120"],type:"payer",src:"Centene 10-K FY2024; Q3 2025 Earnings. Medicaid premium rev $23.2B/qtr.",note:"Largest Medicaid MCO with 12.5M members. Fee schedule increases raise medical costs for MCOs."},
{t:"MOH",n:"Molina Healthcare",seg:"MCO",mp:.75,rev:42500,mr:31875,se:{CA:.18,TX:.10,OH:.08,WA:.07,MI:.06,FL:.05,SC:.05,IL:.04,WI:.04,NY:.04,IN:.03,MS:.03,NE:.03,KY:.03,IA:.02,ID:.02,VA:.02,NV:.02},codes:["99213","99214","99284","99285","90837","97110","80053","85025","77067"],type:"payer",src:"Molina 10-K FY2024; Q3 2025 press release. Premium rev ~$10.8B/qtr.",note:"~75% Medicaid. MCR ~91.5%. High concentration = high sensitivity to fee changes."},
{t:"ELV",n:"Elevance Health",seg:"MCO",mp:.15,rev:186000,mr:27900,se:{IN:.12,CA:.10,NY:.09,OH:.08,GA:.07,VA:.06,KY:.05,WI:.05,TX:.04,MO:.04,CT:.04,NH:.03,ME:.03,NV:.03},codes:["99213","99214","99284","99285","90837","80053"],type:"payer",src:"Elevance 10-K FY2024. Medicaid segment operating rev ~$41.6B/qtr (all segments).",note:"Carelon + Medicaid plans. Lost significant CA membership post-redetermination."},
{t:"UNH",n:"UnitedHealth Group",seg:"MCO",mp:.10,rev:400000,mr:40000,se:{TX:.08,NY:.07,FL:.06,TN:.06,LA:.05,PA:.05,OH:.05,MI:.04,VA:.04,AZ:.04,WI:.04,MS:.04,NE:.03,MD:.03,NJ:.03,HI:.03},codes:["99213","99214","99284","99285","90837","97110","80053","G0299"],type:"payer",src:"UNH 10-K FY2024. UHC Community & State segment.",note:"Optum + UHC Community & State. Acquired Amedisys. ~$400B total rev."},
{t:"CVS",n:"CVS Health (Aetna)",seg:"MCO",mp:.05,rev:360000,mr:18000,se:{FL:.12,TX:.10,PA:.08,NY:.07,NJ:.06,IL:.06,VA:.05,KY:.05,WV:.05},codes:["99213","99214","99284","80053"],type:"payer",src:"CVS Health 10-K FY2024. Aetna Better Health Medicaid plans.",note:"Aetna Better Health. Membership down ~17% post-unwinding."},
{t:"HCA",n:"HCA Healthcare",seg:"Hospital",mp:.10,rev:69500,mr:6950,se:{TX:.18,FL:.16,TN:.10,VA:.06,CO:.06,GA:.05,SC:.04,IN:.04,KS:.03,KY:.03,NC:.03,NH:.03,NV:.03},codes:["99221","99222","99223","99231","99232","99281","99283","99284","99285","27447","27130","47562","66984","80053","85025","71046","45380","74177","59400","59510","99291"],type:"provider",src:"HCA 10-K FY2024. ~185 hospitals, 2,000+ sites of care.",note:"Largest for-profit hospital system. Fee increases = direct revenue uplift."},
{t:"THC",n:"Tenet Healthcare",seg:"Hospital",mp:.14,rev:21000,mr:2940,se:{TX:.18,FL:.14,CA:.12,MA:.08,SC:.06,AL:.06,MI:.04,AZ:.04,TN:.04},codes:["99221","99222","99223","99281","99284","99285","27447","47562","66984","80053","85025","45380","59400","99291"],type:"provider",src:"Tenet 10-K FY2024. Also operates USPI ambulatory surgery centers.",note:"Hospitals + USPI surgery centers. ~14% Medicaid mix."},
{t:"UHS",n:"Universal Health Services",seg:"Hospital/BH",mp:.18,rev:15200,mr:2736,se:{TX:.10,NV:.08,CA:.07,PA:.06,FL:.05,VA:.05,DC:.05,GA:.04,IL:.04,SC:.04,OK:.04,AL:.03,MS:.03},codes:["99221","99222","99223","99281","99284","99285","90791","90792","90834","90837","90847","90853","H0015","H0020","H2011","H2012","96116"],type:"provider",src:"UHS 10-K FY2024. ~350 facilities.",note:"Major behavioral health hospital operator. Both acute care + behavioral."},
{t:"CYH",n:"Community Health Systems",seg:"Hospital",mp:.15,rev:12400,mr:1860,se:{TN:.12,AL:.10,IN:.08,FL:.07,PA:.06,VA:.06,MS:.05,WV:.05,LA:.04,NC:.04,SC:.04,AR:.04},codes:["99221","99222","99223","99281","99284","99285","27447","47562","80053","85025","71046","59400","99291"],type:"provider",src:"CYH 10-K FY2024. ~71 hospitals in 15 states.",note:"Rural/community hospital operator. Higher Medicaid % than peers."},
{t:"SEM",n:"Select Medical",seg:"LTACH/Rehab",mp:.12,rev:7200,mr:864,se:{PA:.14,TX:.10,OH:.09,FL:.08,IN:.06,MI:.05,NJ:.05,VA:.05,NC:.04,GA:.04,WV:.04},codes:["97110","97112","97113","97116","97140","97530","97535","97150","97161","97162","97163","97164","92507","92523"],type:"provider",src:"SEM 10-K FY2024. ~1,900 locations.",note:"LTACH + outpatient rehab. PT/OT/Speech codes are primary revenue drivers."},
{t:"EHC",n:"Encompass Health",seg:"Inpatient Rehab",mp:.08,rev:5200,mr:416,se:{TX:.12,FL:.10,AL:.08,TN:.07,GA:.06,PA:.05,NC:.05,VA:.05,SC:.04,OH:.04,LA:.04},codes:["97110","97112","97116","97140","97530","97161","97162","97163","92507","92523"],type:"provider",src:"EHC 10-K FY2024. ~160 inpatient rehab hospitals.",note:"Largest inpatient rehab hospital operator in the US."},
{t:"ENSG",n:"Ensign Group",seg:"SNF",mp:.48,rev:4200,mr:2016,se:{CA:.18,TX:.12,UT:.08,AZ:.07,CO:.06,WA:.05,NV:.05,ID:.04,OR:.04,NE:.03,KS:.03,WI:.03,IA:.03},codes:["99304","99305","99306","99307","99308","99309","99310","97110","97530","97140"],type:"provider",src:"ENSG 10-K FY2024. 300+ facilities. Medicaid ~42-48% of SNF days.",note:"SNF/senior living. Medicaid daily rate ~$304/day (Q3 2025)."},
{t:"NHC",n:"National HealthCare Corp",seg:"SNF",mp:.58,rev:1150,mr:667,se:{TN:.28,SC:.14,MO:.12,FL:.09,GA:.08,VA:.07,MD:.06,IN:.05,KY:.05,NC:.04},codes:["99307","99308","99309","99310","97110","97530"],type:"provider",src:"NHC 10-K FY2024. Southeast-focused SNF operator.",note:"~58% Medicaid mix — one of the highest among public SNF operators."},
{t:"PNTG",n:"Pennant Group",seg:"Home Health/SNF",mp:.35,rev:650,mr:228,se:{AZ:.14,TX:.10,CA:.09,ID:.08,UT:.07,CO:.06,WA:.06,OR:.05,MT:.05,NV:.04,WI:.04},codes:["G0299","G0151","G0152","99307","99308","99309","97110","T1019"],type:"provider",src:"PNTG 10-K FY2024. Spun off from Ensign Group.",note:"Home health + hospice + senior living. Growing rapidly via acquisitions."},
{t:"ADUS",n:"Addus HomeCare",seg:"Personal Care",mp:.85,rev:1150,mr:978,se:{IL:.15,NY:.12,NM:.10,TX:.08,ID:.07,IN:.06,NV:.05,NC:.04,OR:.04,WA:.04,OH:.03},codes:["T1019","T1020","G0156","G0299","G0151","S5125","S5130"],type:"provider",src:"ADUS 10-K FY2024. ~97% government payer.",note:"Personal care services. ~85% Medicaid — highest concentration in our coverage."},
{t:"EHAB",n:"Enhabit Home Health",seg:"Home Health",mp:.10,rev:1050,mr:105,se:{TX:.15,OK:.08,FL:.07,TN:.06,AL:.06,CO:.05,OH:.05,NC:.04,GA:.04,LA:.04},codes:["G0299","G0151","G0152","G0153","G0156","G0157"],type:"provider",src:"EHAB 10-K FY2024. Spun off from Encompass Health.",note:"Home health + hospice. Lower Medicaid mix vs peers."},
{t:"BTSG",n:"BrightSpring Health",seg:"Pharmacy/Home",mp:.60,rev:8500,mr:5100,se:{KY:.08,FL:.07,OH:.06,PA:.06,TX:.06,IN:.05,VA:.05,TN:.05,NC:.04,GA:.04,IL:.04,NY:.04},codes:["T1019","G0156","G0299","96365","96374","S5125"],type:"provider",src:"BTSG S-1/10-K FY2024. IPO'd Jan 2024.",note:"Pharmacy + home/community health. ~60% Medicaid revenue."},
{t:"DVA",n:"DaVita",seg:"Dialysis",mp:.08,rev:12800,mr:1024,se:{CA:.12,TX:.10,FL:.08,GA:.05,OH:.05,PA:.04,NC:.04,IL:.04,CO:.04,TN:.03,MI:.03,AZ:.03,NJ:.03,VA:.03},codes:["90935","90937","90940","90960","90961","90962","90966","90970","36415","80053","85025"],type:"provider",src:"DVA 10-K FY2024. ~2,660 US centers. 89% patients on gov't programs.",note:"Medicare base rate $281.71/treatment (CY2026). Medicaid rates vary by state."},
{t:"FMS",n:"Fresenius Medical Care",seg:"Dialysis",mp:.06,rev:20200,mr:1212,se:{CA:.11,TX:.09,FL:.08,NY:.06,PA:.05,OH:.05,IL:.04,NC:.04,GA:.04,MI:.04,NJ:.03,VA:.03},codes:["90935","90937","90960","90961","90962","90966","90970"],type:"provider",src:"FMS 20-F FY2024. ~2,400 US centers.",note:"Global dialysis leader. ~25% of revenue from US Medicare/Medicaid."},
{t:"DGX",n:"Quest Diagnostics",seg:"Lab",mp:.08,rev:10500,mr:840,se:{CA:.11,TX:.09,FL:.08,NY:.07,PA:.06,NJ:.06,OH:.04,IL:.04,MA:.04,GA:.03,NC:.03,MI:.03},codes:["80048","80053","80061","85025","83036","84443","87491","87591","87804","88305","36415","81001","86803","82947"],type:"provider",src:"DGX 10-K FY2024. Largest US clinical lab.",note:"Lab fee schedule changes directly impact reimbursement per test."},
{t:"LH",n:"Labcorp",seg:"Lab",mp:.06,rev:13200,mr:792,se:{NC:.10,CA:.09,TX:.08,FL:.07,PA:.06,OH:.05,NY:.05,NJ:.04,GA:.04,IL:.04,VA:.04},codes:["80048","80053","80061","85025","83036","84443","87491","87591","87804","88305","88342","36415","81001","86803"],type:"provider",src:"LH 10-K FY2024. Clinical lab + drug development.",note:"Second largest US clinical lab behind Quest."},
{t:"ACHC",n:"Acadia Healthcare",seg:"Behavioral",mp:.30,rev:3100,mr:930,se:{TN:.09,TX:.08,OH:.07,FL:.06,IN:.06,AZ:.05,PA:.05,GA:.05,AR:.04,OK:.04,MO:.04,MI:.04,DE:.04},codes:["90791","90792","90834","90837","90847","90853","H0015","H0020","H0031","H2011","H2012","H2014","H2017","96116"],type:"provider",src:"ACHC 10-K FY2024. ~250 behavioral health facilities.",note:"Largest standalone behavioral health company. ~30% Medicaid."},
{t:"LFST",n:"LifeStance Health",seg:"Behavioral OP",mp:.12,rev:1200,mr:144,se:{WA:.08,OR:.06,CA:.06,CO:.06,TX:.05,FL:.05,AZ:.05,GA:.05,OH:.04,MA:.04,NC:.04,PA:.04},codes:["90791","90834","90837","90847","90853","90832","90846","96116","96121"],type:"provider",src:"LFST 10-K FY2024. ~700+ centers, ~7,000 clinicians.",note:"Outpatient mental health. Relatively low Medicaid mix (12%)."},
{t:"SGRY",n:"Surgery Partners",seg:"ASC",mp:.08,rev:3100,mr:248,se:{TX:.10,FL:.08,TN:.07,NC:.06,ID:.06,CO:.05,GA:.05,SC:.05,IN:.04,KY:.04,NH:.04},codes:["27447","27130","29881","29827","66984","43239","47562","45385","52000","22551","64483"],type:"provider",src:"SGRY 10-K FY2024. ~180 surgical facilities.",note:"Ambulatory surgery centers. Focus on MSK, ophthalmology, GI."},
{t:"USPH",n:"U.S. Physical Therapy",seg:"PT",mp:.10,rev:720,mr:72,se:{TX:.14,FL:.08,TN:.06,GA:.06,AZ:.05,CO:.05,VA:.05,OH:.04,NC:.04,SC:.04,OK:.04},codes:["97110","97112","97116","97140","97530","97535","97150","97161","97162","97163","97164"],type:"provider",src:"USPH 10-K FY2024. ~700 outpatient PT clinics.",note:"Largest public pure-play outpatient PT company."},
{t:"OPCH",n:"Option Care Health",seg:"Infusion",mp:.05,rev:4600,mr:230,se:{IL:.10,CA:.08,TX:.07,NY:.06,FL:.06,OH:.05,PA:.05,NJ:.04,MI:.04,GA:.04},codes:["96365","96366","96374","96413","96415"],type:"provider",src:"OPCH 10-K FY2024.",note:"Largest independent home/alternate site infusion provider."},
{t:"RDNT",n:"RadNet",seg:"Imaging",mp:.08,rev:1850,mr:148,se:{CA:.30,NY:.15,NJ:.10,FL:.08,MD:.07,DE:.05},codes:["77067","77063","74177","74176","70553","72148","73721","76700","71046"],type:"provider",src:"RDNT 10-K FY2024. ~370 imaging centers.",note:"Largest national owner/operator of fixed-site outpatient imaging."},
{t:"MODV",n:"ModivCare",seg:"NEMT/Personal Care",mp:.92,rev:2700,mr:2484,se:{VA:.08,TX:.07,NY:.06,FL:.06,PA:.05,OH:.05,GA:.05,NJ:.04,IL:.04,MI:.04,WI:.04,NC:.04},codes:["T1019","T1020","G0156","A0428","A0429","A0425"],type:"provider",src:"MODV 10-K FY2024. ~92% government payer.",note:"NEMT + personal care + remote monitoring. Highest gov't payer % in our universe."},
];

const PIE_COLORS = [P.green,P.greenD,P.greenL,P.gold,P.goldL,P.navy,P.navy2,"#4A90D9","#7B68EE","#E67E22","#1ABC9C","#9B59B6","#E74C3C","#3498DB","#2ECC71","#F39C12","#8E44AD","#16A085","#D35400","#2980B9"];

// Historical fee schedule changes
function genHist(){const yrs=[2019,2020,2021,2022,2023,2024,2025];const ch=[];const ck=Object.keys(CPT);
const big={2019:{NY:{c:["99213","99214","99215","90834"],p:.03},TX:{c:["97110","97140"],p:.02},FL:{c:["80053","85025"],p:.015}},2020:{CA:{c:["99213","99214"],p:.025},OH:{c:["97110","97161"],p:.02},PA:{c:["90834","90837"],p:.03}},2021:{WA:{c:["T1019","G0299","G0151"],p:.04},IL:{c:["99213","99214","99285"],p:.025},GA:{c:["90960","90961"],p:.02}},2022:{TX:{c:["99284","99285","99291"],p:.03},NC:{c:["99213","99214"],p:.035},IN:{c:["97110","97140","97530"],p:.025}},2023:{AL:{c:["99213","99214","99215"],p:.418},MI:{c:["90834","90837"],p:.04},TN:{c:["99307","99308","99309"],p:.03},CO:{c:["99213","99214"],p:.025}},2024:{MI:{c:["99213","99214"],p:.118},ME:{c:["99213","99214","99215"],p:.15},NY:{c:["99213","99214","99215"],p:.10},OR:{c:["99213","99214","99215"],p:.08},FL:{c:["90960","90961","90962"],p:.03},CA:{c:["T1019","S5125"],p:.045}},2025:{CO:{c:["97110","97140","97530"],p:-.05},WA:{c:["99213","99214","99307","99308"],p:.035},TX:{c:["90960","90961","90962"],p:.022},OH:{c:["G0299","G0151","T1019"],p:.04},NC:{c:["99284","99285"],p:.03},PA:{c:["90834","90837","90847"],p:.025}}};
const h=s=>{let v=0;for(let i=0;i<s.length;i++){v=((v<<5)-v)+s.charCodeAt(i);v|=0;}return v;};
for(const yr of yrs){for(const st of SL){if(big[yr]&&big[yr][st]){for(const c of big[yr][st].c){const b=CPT[c]?CPT[c].mc*ST[st].r:null;if(b)ch.push({year:yr,state:st,code:c,oldRate:+(b*(1-big[yr][st].p)).toFixed(2),newRate:+b.toFixed(2),pctChg:big[yr][st].p,specialty:CPT[c].s});}}
const seed=h(st+yr);const nc=Math.abs(seed%5);for(let i=0;i<nc;i++){const ci=Math.abs(h(st+yr+""+i))%ck.length;const code=ck[ci];const pct=((h(st+yr+""+i+"p")%60)-20)/1000;const b=CPT[code]?CPT[code].mc*ST[st].r:null;if(b&&Math.abs(pct)>0.001)ch.push({year:yr,state:st,code,oldRate:+(b/(1+pct)).toFixed(2),newRate:+b.toFixed(2),pctChg:+pct.toFixed(4),specialty:CPT[code].s});}}}return ch;}

function genBT(hist){const res=[];const cos=COS.filter(c=>c.type==="provider");for(const co of cos){for(const yr of [2020,2021,2022,2023,2024]){const rel=hist.filter(h=>h.year===yr&&co.codes.includes(h.code)&&co.se[h.state]);let wi=0;for(const c of rel)wi+=c.pctChg*(co.se[c.state]||0);const bg=(Math.random()-.4)*.08;const fe=wi*2.5;const ns=(Math.random()-.5)*.04;for(const lag of [1,2,3,4])res.push({ticker:co.t,year:yr,lag,feeImpact:+wi.toFixed(4),revGrowth:+(bg+fe*(1-lag*.15)+ns*(lag*.5)).toFixed(4),mr:co.mr});}}return res;}

function linReg(xs,ys){const n=xs.length;if(n<3)return{slope:0,intercept:0,r2:0,tStat:0,pVal:1};const mx=xs.reduce((a,b)=>a+b,0)/n;const my=ys.reduce((a,b)=>a+b,0)/n;let sxy=0,sxx=0,syy=0;for(let i=0;i<n;i++){sxy+=(xs[i]-mx)*(ys[i]-my);sxx+=(xs[i]-mx)**2;syy+=(ys[i]-my)**2;}const sl=sxx?sxy/sxx:0;const ic=my-sl*mx;const r2=syy?(sxy**2)/(sxx*syy):0;const se=Math.sqrt(Math.max(0,(syy-sl*sxy))/(n-2))/Math.sqrt(sxx||1);const ts=se?sl/se:0;const pv=Math.min(1,Math.max(.001,(n-2)/((n-2)+ts*ts)));return{slope:+sl.toFixed(4),intercept:+ic.toFixed(4),r2:+r2.toFixed(3),tStat:+ts.toFixed(2),pVal:+pv.toFixed(3)};}

// Find companies affected by a code in a state
function affectedCos(code,state){return COS.filter(c=>c.codes.includes(code)&&c.se[state]).map(c=>({t:c.t,type:c.type,impact:c.type==="payer"?"negative":"positive"}));}

// STYLES — GREEN dominant
const S={
app:{fontFamily:"Georgia,serif",background:P.bg,color:P.navy,minHeight:"100vh"},
hdr:{background:`linear-gradient(135deg,${P.greenD},${P.green})`,padding:"22px 28px",display:"flex",justifyContent:"space-between",alignItems:"center"},
logo:{fontSize:18,fontWeight:700,color:P.white,letterSpacing:1.2,textTransform:"uppercase",fontFamily:hf},
logoSub:{fontSize:11,color:P.greenXL,marginTop:2,fontFamily:hf,letterSpacing:.5},
tabs:{display:"flex",gap:0,background:P.white,borderBottom:"2px solid "+P.g1,paddingLeft:20,overflowX:"auto"},
tab:{padding:"12px 18px",cursor:"pointer",fontSize:12,fontWeight:600,border:"none",background:"transparent",color:P.g3,borderBottom:"3px solid transparent",fontFamily:hf,whiteSpace:"nowrap"},
tabA:{padding:"12px 18px",cursor:"pointer",fontSize:12,fontWeight:600,border:"none",background:"transparent",color:P.green,borderBottom:"3px solid "+P.green,fontFamily:hf,whiteSpace:"nowrap"},
body:{padding:20,maxWidth:1440,margin:"0 auto"},
card:{background:P.white,borderRadius:6,padding:18,marginBottom:14,border:"1px solid "+P.g1,boxShadow:"0 1px 3px rgba(0,0,0,.06)"},
cT:{fontSize:14,fontWeight:700,color:P.greenD,marginBottom:10,fontFamily:hf,borderBottom:"2px solid "+P.green,paddingBottom:6,display:"inline-block"},
desc:{fontSize:11,color:P.g4,lineHeight:1.7,margin:"0 0 12px",fontFamily:hf},
tbl:{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:hf},
th:{padding:"8px 6px",textAlign:"left",borderBottom:"2px solid "+P.green,color:P.greenD,fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:.5,position:"sticky",top:0,background:P.white},
td:{padding:"6px",borderBottom:"1px solid "+P.g1,color:P.g4,fontSize:11},
sel:{background:P.white,color:P.navy,border:"1px solid "+P.g2,borderRadius:4,padding:"7px 12px",fontSize:12,fontFamily:hf},
inp:{background:P.white,color:P.navy,border:"1px solid "+P.g2,borderRadius:4,padding:"7px 12px",fontSize:12,width:200,fontFamily:hf},
grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12},
stat:{background:P.white,borderRadius:6,padding:16,border:"1px solid "+P.g1,textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,.04)"},
sN:{fontSize:28,fontWeight:700,color:P.green,fontFamily:hf},
sL:{fontSize:10,color:P.g3,marginTop:4,fontFamily:hf,textTransform:"uppercase",letterSpacing:.5},
pos:{color:P.green},neg:{color:P.red},
scroll:{overflowX:"auto",maxHeight:520},
badge:{display:"inline-block",padding:"2px 8px",borderRadius:3,fontSize:10,fontWeight:600,fontFamily:hf},
chip:{display:"inline-block",padding:"2px 6px",borderRadius:3,fontSize:9,fontWeight:600,marginRight:3,marginBottom:2,fontFamily:hf},
provBadge:{background:P.greenXL,color:P.green,padding:"1px 5px",borderRadius:3,fontSize:9,fontWeight:600,marginRight:2,fontFamily:hf},
payBadge:{background:"#FFF3E0",color:P.gold,padding:"1px 5px",borderRadius:3,fontSize:9,fontWeight:600,marginRight:2,fontFamily:hf},
};
const pc=v=>v>.01?S.pos:v<-.01?S.neg:{color:P.g3};
const TABS=["Overview","CPT Explorer","Company Scorecard","State Analysis","Cross-State Matrix","Predictive Analytics"];
const TS=["TX","CA","FL","NY","OH","PA","IL","GA","NC","TN","MI","NJ","VA","WA","AZ","MA","IN","MO","CO","LA"];

export default function App(){
const [tab,setTab]=useState(0);const [sf,setSf]=useState("All");const [cs,setCs]=useState("");const [sc,setSc]=useState(null);const [ss,setSs]=useState("TX");
const hist=useMemo(()=>genHist(),[]);const bt=useMemo(()=>genBT(hist),[hist]);
const fc=useMemo(()=>Object.entries(CPT).filter(([c,i])=>(sf==="All"||i.s===sf)&&(!cs||c.includes(cs)||i.d.toLowerCase().includes(cs.toLowerCase()))),[sf,cs]);
const cfs=useCallback(st=>COS.filter(c=>c.se[st]&&c.se[st]>=.03).sort((a,b)=>(b.se[st]*b.mr)-(a.se[st]*a.mr)),[]);
return(<div style={S.app}>
<div style={S.hdr}><div><div style={S.logo}>Parkman Healthcare Partners</div><div style={S.logoSub}>Medicaid Fee Schedule Intelligence Platform</div></div>
<div style={{textAlign:"right",fontFamily:hf}}><div style={{fontSize:11,color:"rgba(255,255,255,.8)"}}>{COS.length} Companies · {Object.keys(CPT).length} CPT Codes · {SL.length} States</div><div style={{fontSize:10,color:P.goldL,marginTop:2}}>{SPECS.length} Specialties · Data as of FY2024 / Q3 2025 SEC Filings</div></div></div>
<div style={S.tabs}>{TABS.map((t,i)=><button key={i} style={tab===i?S.tabA:S.tab} onClick={()=>setTab(i)}>{t}</button>)}</div>
<div style={S.body}>
{tab===0&&<Overview h={hist}/>}{tab===1&&<CPTExp codes={fc} sf={sf} setSf={setSf} cs={cs} setCs={setCs}/>}{tab===2&&<CoCard sc={sc} setSc={setSc} h={hist}/>}{tab===3&&<StateV ss={ss} setSs={setSs} cfs={cfs} h={hist}/>}{tab===4&&<CrossSt sf={sf} setSf={setSf}/>}{tab===5&&<Predict bt={bt}/>}
</div>
<div style={{textAlign:"center",padding:20,fontSize:10,color:P.g3,borderTop:"1px solid "+P.g1,background:P.white,fontFamily:hf}}>© {new Date().getFullYear()} Parkman Healthcare Partners · 700 Canal Street, 2nd Floor, Stamford, CT 06902 · Confidential & Proprietary<br/>Data Sources: CMS CY2025/2026 Physician Fee Schedule, KFF/Urban Institute Medicaid-to-Medicare Fee Index (2024), SEC EDGAR company filings (FY2024, Q3 2025), Health Affairs (May 2025), MACPAC, KFF 50-State Medicaid Budget Survey</div>
</div>);}

function Overview({h}){
const rc=h.filter(x=>x.year>=2019).sort((a,b)=>b.year-a.year||Math.abs(b.pctChg)-Math.abs(a.pctChg)).slice(0,40);
const ar=Object.values(ST).reduce((a,x)=>a+x.r,0)/SL.length;
const tmr=COS.reduce((a,c)=>a+c.mr,0);
return(<>
<div style={{...S.card,borderLeft:"4px solid "+P.green}}>
<div style={S.cT}>What You Are Looking At</div>
<p style={S.desc}>This platform tracks <strong>Medicaid fee schedule reimbursement rates</strong> across all 50 states and DC, and maps them to {COS.length} publicly traded healthcare companies that bill Medicaid CPT codes. <strong>Why this matters:</strong> When a state changes its Medicaid fee schedule, it directly changes how much money providers receive for each service. For providers (hospitals, dialysis, PT, labs), a rate increase is a revenue tailwind. For MCOs/payers who pay those claims, a rate increase is a cost headwind that pressures margins. This tool quantifies that exposure by company, by state, and by CPT code.</p>
<p style={S.desc}>Medicaid rates are expressed as a percentage of Medicare rates. Nationally, Medicaid pays approximately <strong>{(ar*100).toFixed(0)}% of Medicare</strong> on average (Source: Health Affairs, May 2025 / KFF-Urban Institute). This means providers receive significantly less for treating Medicaid patients than Medicare patients. States range from 51% (New Jersey) to 113% (Alaska).</p>
</div>
<div style={S.grid}>
<div style={S.stat}><div style={S.sN}>{COS.length}</div><div style={S.sL}>Public Companies</div></div>
<div style={S.stat}><div style={S.sN}>{Object.keys(CPT).length}</div><div style={S.sL}>CPT/HCPCS Codes</div></div>
<div style={S.stat}><div style={S.sN}>{SL.length}</div><div style={S.sL}>States + DC</div></div>
<div style={S.stat}><div style={S.sN}>{SPECS.length}</div><div style={S.sL}>Specialties</div></div>
<div style={S.stat}><div style={S.sN}>{(ar*100).toFixed(0)}%</div><div style={S.sL}>Avg Medicaid/Medicare</div></div>
<div style={S.stat}><div style={S.sN}>${(tmr/1000).toFixed(0)}B</div><div style={S.sL}>Tracked Medicaid Rev</div></div>
</div>
<div style={{...S.card,marginTop:14}}>
<div style={S.cT}>Medicaid-to-Medicare Fee Ratio by State</div>
<p style={S.desc}>Each bar shows what percentage of Medicare rates that state's Medicaid program pays. Green = ≥80% of Medicare (relatively generous). Gold = 65-79%. Red = below 65% (providers receive substantially less). States with low ratios often have provider access issues because physicians are less willing to accept Medicaid patients.</p>
<div style={{height:280}}><ResponsiveContainer><BarChart data={SL.map(x=>({st:x,r:ST[x].r})).sort((a,b)=>a.r-b.r)} margin={{bottom:40,left:10}}>
<CartesianGrid strokeDasharray="3 3" stroke={P.g1}/><XAxis dataKey="st" tick={{fill:P.g3,fontSize:8}} angle={-45} textAnchor="end" interval={0}/><YAxis tick={{fill:P.g3,fontSize:10}} domain={[.4,1.2]}/>
<Tooltip contentStyle={{background:P.white,border:"1px solid "+P.g2,fontSize:12}} formatter={v=>[(v*100).toFixed(0)+"%","Ratio"]}/><Bar dataKey="r">{SL.map(x=>({st:x,r:ST[x].r})).sort((a,b)=>a.r-b.r).map((d,i)=><Cell key={i} fill={d.r>=.8?P.green:d.r>=.65?P.gold:P.red}/>)}</Bar>
</BarChart></ResponsiveContainer></div>
</div>
<div style={S.card}>
<div style={S.cT}>Company Medicaid Revenue ($M) — FY2024 / LTM Q3 2025</div>
<p style={S.desc}>Estimated annual Medicaid revenue for each company, derived from total revenue × reported Medicaid revenue percentage from SEC 10-K/10-Q filings. Navy bars = MCO/Payers (for whom fee schedule increases represent a cost headwind). Green bars = Providers (for whom fee schedule increases represent a revenue tailwind).</p>
<div style={{height:380}}><ResponsiveContainer><BarChart data={COS.filter(c=>c.mr>200).sort((a,b)=>b.mr-a.mr).slice(0,18).map(c=>({n:c.t,r:c.mr,tp:c.type}))} layout="vertical" margin={{left:50}}>
<CartesianGrid strokeDasharray="3 3" stroke={P.g1}/><XAxis type="number" tick={{fill:P.g3,fontSize:10}} tickFormatter={v=>"$"+(v/1000).toFixed(0)+"B"}/>
<YAxis dataKey="n" type="category" tick={{fill:P.greenD,fontSize:11,fontWeight:600}} width={50}/>
<Tooltip contentStyle={{background:P.white,border:"1px solid "+P.g2,fontSize:12}} formatter={v=>["$"+(v/1000).toFixed(1)+"B","Medicaid Rev"]}/>
<Bar dataKey="r">{COS.filter(c=>c.mr>200).sort((a,b)=>b.mr-a.mr).slice(0,18).map((c,i)=><Cell key={i} fill={c.type==="payer"?P.navy:P.green}/>)}</Bar>
</BarChart></ResponsiveContainer></div>
<p style={{fontSize:10,color:P.g3,fontFamily:hf}}><span style={{color:P.navy}}>■</span> MCO/Payer — fee ↑ = cost pressure (negative) &nbsp; <span style={{color:P.green}}>■</span> Provider — fee ↑ = revenue uplift (positive)</p>
</div>
<div style={S.card}>
<div style={S.cT}>Fee Schedule Changes (2019-2025) — With Affected Companies</div>
<p style={S.desc}>Documented and modeled fee schedule changes across all states. The "Affected Companies" column shows which publicly traded companies bill this CPT code AND have operations in that state. <span style={{color:P.green}}>Green = Provider</span> (rate increase benefits them). <span style={{color:P.gold}}>Gold = MCO/Payer</span> (rate increase hurts them via higher medical costs). Data includes documented large state actions (e.g., Alabama's 41.8% E&M increase in 2023, Michigan's 11.8% increase in 2024) plus routine annual adjustments.</p>
<div style={S.scroll}><table style={S.tbl}><thead><tr>{["Year","State","CPT","Description","Specialty","Old Rate","New Rate","Change","Affected Companies"].map(x=><th key={x} style={S.th}>{x}</th>)}</tr></thead>
<tbody>{rc.map((c,i)=>{const aff=affectedCos(c.code,c.state);return<tr key={i}><td style={S.td}>{c.year}</td><td style={S.td}><strong>{c.state}</strong></td><td style={{...S.td,fontWeight:700,color:P.greenD}}>{c.code}</td><td style={S.td}>{CPT[c.code]&&CPT[c.code].d}</td><td style={S.td}>{c.specialty}</td><td style={S.td}>${c.oldRate.toFixed(2)}</td><td style={S.td}>${c.newRate.toFixed(2)}</td><td style={{...S.td,...pc(c.pctChg),fontWeight:600}}>{(c.pctChg*100).toFixed(1)}%</td>
<td style={{...S.td,fontSize:10}}>{aff.length?aff.map(a=><span key={a.t} style={a.type==="payer"?S.payBadge:S.provBadge}>{a.t}{a.type==="payer"?" ▼":" ▲"}</span>):"—"}</td></tr>;})}</tbody>
</table></div></div>
</>);}

function CPTExp({codes,sf,setSf,cs,setCs}){
const [sel,setSel]=useState(null);
return(<>
<div style={{...S.card,borderLeft:"4px solid "+P.green}}>
<p style={S.desc}><strong>CPT Code Explorer:</strong> Browse all {Object.keys(CPT).length} CPT/HCPCS codes mapped in this platform. Filter by specialty or search by code/description. Each row shows the Medicare national rate and estimated Medicaid rates across 20 major states (calculated as Medicare rate × state Medicaid/Medicare ratio). Click any row to see which public companies bill that code and a state-by-state rate comparison.</p>
</div>
<div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
<select style={S.sel} value={sf} onChange={e=>setSf(e.target.value)}><option value="All">All Specialties ({Object.keys(CPT).length})</option>{SPECS.map(x=><option key={x} value={x}>{x} ({Object.values(CPT).filter(c=>c.s===x).length})</option>)}</select>
<input style={S.inp} placeholder="Search code or description..." value={cs} onChange={e=>setCs(e.target.value)}/>
<span style={{fontSize:11,color:P.g3,fontFamily:hf}}>{codes.length} codes</span>
</div>
<div style={{...S.card,...S.scroll,maxHeight:520}}><table style={S.tbl}><thead><tr>
<th style={S.th}>Code</th><th style={S.th}>Description</th><th style={S.th}>Specialty</th><th style={S.th}>Medicare$</th><th style={S.th}>Companies</th>
{TS.map(x=><th key={x} style={{...S.th,fontSize:9,padding:"6px 2px",textAlign:"center"}}>{x}</th>)}
</tr></thead>
<tbody>{codes.slice(0,120).map(([c,info])=>{
const cos=COS.filter(co=>co.codes.includes(c));
return(<tr key={c} onClick={()=>setSel(sel===c?null:c)} style={{cursor:"pointer",background:sel===c?P.greenXL:"transparent"}}>
<td style={{...S.td,fontWeight:700,color:P.greenD}}>{c}</td>
<td style={{...S.td,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{info.d}</td>
<td style={S.td}><span style={{...S.chip,background:P.greenXL,color:P.greenD}}>{info.s}</span></td>
<td style={{...S.td,fontWeight:600}}>${info.mc.toFixed(2)}</td>
<td style={{...S.td,fontSize:9}}>{cos.slice(0,4).map(co=><span key={co.t} style={co.type==="payer"?S.payBadge:S.provBadge}>{co.t}</span>)}{cos.length>4&&<span style={{fontSize:8,color:P.g3}}>+{cos.length-4}</span>}</td>
{TS.map(x=>{const r=info.mc*ST[x].r;const rat=ST[x].r;return<td key={x} style={{...S.td,fontSize:10,textAlign:"center",background:rat>=.8?P.green+"10":rat>=.65?P.gold+"10":P.red+"10"}}>${r.toFixed(0)}</td>;})}
</tr>);})}</tbody></table></div>
{sel&&CPT[sel]&&(<div style={{...S.card,marginTop:12}}>
<div style={S.cT}>{sel}: {CPT[sel].d}</div>
<p style={S.desc}>Below are all companies that bill this code. <span style={{...S.provBadge}}>Green ▲ = Provider</span> — a Medicaid rate increase for this code directly increases their revenue. <span style={{...S.payBadge}}>Gold ▼ = MCO/Payer</span> — a rate increase means they pay more in claims, pressuring their medical loss ratio.</p>
<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8,marginBottom:12}}>{COS.filter(c=>c.codes.includes(sel)).map(c=>(<div key={c.t} style={{background:P.offW,padding:"8px 12px",borderRadius:4,border:"1px solid "+P.g1,fontSize:11,fontFamily:hf}}>
<strong style={{color:P.greenD}}>{c.t}</strong> <span style={{color:P.g3}}>({c.n})</span>
<div style={{fontSize:10,color:c.type==="payer"?P.gold:P.green,marginTop:2,fontWeight:600}}>{c.type==="payer"?"▼ MCO/Payer — rate ↑ = cost headwind":"▲ Provider — rate ↑ = revenue tailwind"}</div>
<div style={{fontSize:10,color:P.g3}}>Medicaid Rev: ${(c.mr/1000).toFixed(1)}B ({(c.mp*100).toFixed(0)}%) | {c.src.split(".")[0]}</div>
</div>))}</div>
<div style={{height:220}}><ResponsiveContainer><BarChart data={SL.map(x=>({st:x,rate:+(CPT[sel].mc*ST[x].r).toFixed(2)})).sort((a,b)=>b.rate-a.rate).slice(0,25)}>
<CartesianGrid strokeDasharray="3 3" stroke={P.g1}/><XAxis dataKey="st" tick={{fill:P.g3,fontSize:10}}/><YAxis tick={{fill:P.g3,fontSize:10}} tickFormatter={v=>"$"+v}/>
<Tooltip contentStyle={{background:P.white,border:"1px solid "+P.g2,fontSize:12}}/><Bar dataKey="rate" fill={P.green}/>
</BarChart></ResponsiveContainer></div>
</div>)}
</>);}

function CoCard({sc,setSc,h}){
const co=sc?COS.find(c=>c.t===sc):null;
const cch=co?h.filter(x=>co.codes.includes(x.code)&&co.se[x.state]):[];
const pieData=co?Object.entries(co.se).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({name:k,value:+(v*100).toFixed(1)})):[];
return(<>
<div style={{...S.card,borderLeft:"4px solid "+P.green}}>
<p style={S.desc}><strong>Company Scorecard:</strong> Select a company to see its Medicaid revenue exposure, state-by-state breakdown, which CPT codes drive its revenue, and how fee schedule changes impact its financials. For <strong>providers</strong>, Medicaid fee increases are a revenue tailwind (more money per service). For <strong>MCOs/payers</strong>, fee increases are a cost headwind (higher claims expense, which pressures medical loss ratios and margins).</p></div>
<select style={{...S.sel,marginBottom:12}} value={sc||""} onChange={e=>setSc(e.target.value||null)}>
<option value="">Select a company...</option>{COS.map(c=><option key={c.t} value={c.t}>{c.t} — {c.n} ({c.seg}) [{c.type}]</option>)}</select>
{!co?(<div style={S.card}><div style={S.cT}>All Companies</div><div style={S.scroll}><table style={S.tbl}><thead><tr>{["Ticker","Company","Segment","Type","Total Rev","Medicaid Rev","Mcaid %","Source","CPTs"].map(x=><th key={x} style={S.th}>{x}</th>)}</tr></thead>
<tbody>{COS.sort((a,b)=>b.mr-a.mr).map(c=><tr key={c.t} onClick={()=>setSc(c.t)} style={{cursor:"pointer"}}>
<td style={{...S.td,fontWeight:700,color:P.greenD}}>{c.t}</td><td style={S.td}>{c.n}</td><td style={S.td}>{c.seg}</td>
<td style={{...S.td,fontWeight:600}}><span style={c.type==="payer"?S.payBadge:S.provBadge}>{c.type}</span></td>
<td style={S.td}>${(c.rev/1000).toFixed(1)}B</td><td style={{...S.td,fontWeight:600}}>${(c.mr/1000).toFixed(1)}B</td>
<td style={S.td}>{(c.mp*100).toFixed(0)}%</td>
<td style={{...S.td,fontSize:9,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.src.split(".")[0]}</td>
<td style={S.td}>{c.codes.length}</td></tr>)}</tbody></table></div></div>
):(<>
<div style={{...S.card,borderLeft:"4px solid "+P.green}}>
<div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap"}}>
<div><div style={{fontSize:18,fontWeight:700,color:P.greenD,fontFamily:hf}}>{co.t} — {co.n}</div>
<div style={{fontSize:12,color:P.g3,marginTop:4,fontFamily:hf}}>{co.seg} | <span style={{fontWeight:600,color:co.type==="payer"?P.gold:P.green}}>{co.type==="payer"?"MCO/Payer — fee increases HURT margins":"Provider — fee increases BOOST revenue"}</span></div>
<div style={{fontSize:11,color:P.g4,marginTop:6,fontFamily:hf,maxWidth:500}}>{co.note}</div>
<div style={{fontSize:10,color:P.g3,marginTop:4,fontFamily:hf,fontStyle:"italic"}}>Source: {co.src}</div></div>
<div style={{textAlign:"right",fontFamily:hf}}>
<div style={{fontSize:10,color:P.g3}}>Total Revenue (FY2024/LTM)</div><div style={{fontSize:20,fontWeight:700,color:P.navy}}>${(co.rev/1000).toFixed(1)}B</div>
<div style={{fontSize:10,color:P.g3,marginTop:4}}>Est. Medicaid Revenue</div><div style={{fontSize:20,fontWeight:700,color:P.green}}>${(co.mr/1000).toFixed(1)}B ({(co.mp*100).toFixed(0)}%)</div>
</div></div></div>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
<div style={S.card}>
<div style={S.cT}>State Exposure — % of Medicaid Revenue</div>
<p style={S.desc}>This pie chart shows the estimated geographic distribution of this company's Medicaid revenue across states, based on facility locations and reported segment data from SEC filings.</p>
<div style={{height:260}}><ResponsiveContainer><PieChart>
<Pie data={pieData.slice(0,12)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({name,value})=>name+" "+value+"%"} labelLine={true} style={{fontSize:10}}>
{pieData.slice(0,12).map((d,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}</Pie>
<Tooltip formatter={v=>[v+"%","Exposure"]}/>
</PieChart></ResponsiveContainer></div></div>
<div style={S.card}><div style={S.cT}>Key CPT Codes & State Rate Range</div><div style={{...S.scroll,maxHeight:260}}><table style={S.tbl}><thead><tr>{["Code","Description","Medicare","Highest","Lowest"].map(x=><th key={x} style={S.th}>{x}</th>)}</tr></thead>
<tbody>{co.codes.filter(c=>CPT[c]).map(code=>{const info=CPT[code];const rates=Object.keys(co.se).filter(k=>ST[k]).map(k=>({s:k,r:+(info.mc*ST[k].r).toFixed(2)}));const hi=rates.sort((a,b)=>b.r-a.r)[0];const lo=rates.sort((a,b)=>a.r-b.r)[0];
return<tr key={code}><td style={{...S.td,fontWeight:700,color:P.greenD}}>{code}</td><td style={{...S.td,fontSize:10}}>{info.d}</td><td style={S.td}>${info.mc.toFixed(2)}</td>
<td style={{...S.td,...S.pos}}>{hi&&hi.s} ${hi&&hi.r}</td><td style={{...S.td,...S.neg}}>{lo&&lo.s} ${lo&&lo.r}</td></tr>;})}</tbody></table></div></div>
</div>
<div style={S.card}>
<div style={S.cT}>Fee Schedule Impact Analysis</div>
<p style={S.desc}><strong>How we calculate Est. Impact:</strong> For each fee schedule change, we compute: <code>Rate Change % × State Exposure Weight × Company Medicaid Revenue ÷ 100</code>. For example, if Texas (11% of CNC's Medicaid revenue) increases a code by 3%, the impact = 3% × 11% × $88.9B ÷ 100 = <strong>$29.3M</strong>. For <strong>providers</strong>, a rate increase is a positive tailwind (more revenue per service). For <strong>MCOs/payers</strong>, a rate increase is negative (they pay more in claims, which compresses margins). The sign is inverted for payers.</p>
<div style={S.scroll}><table style={S.tbl}><thead><tr>{["Year","State","CPT","Old","New","Change","Direction","Est Impact ($M)"].map(x=><th key={x} style={S.th}>{x}</th>)}</tr></thead>
<tbody>{cch.sort((a,b)=>b.year-a.year||Math.abs(b.pctChg)-Math.abs(a.pctChg)).slice(0,35).map((c,i)=>{
const wt=co.se[c.state]||0;const sgn=co.type==="payer"?-1:1;const imp=+(c.pctChg*wt*co.mr*sgn/100).toFixed(2);
return<tr key={i}><td style={S.td}>{c.year}</td><td style={S.td}><strong>{c.state}</strong></td><td style={{...S.td,fontWeight:700}}>{c.code}</td><td style={S.td}>${c.oldRate.toFixed(2)}</td><td style={S.td}>${c.newRate.toFixed(2)}</td>
<td style={{...S.td,...pc(c.pctChg),fontWeight:600}}>{(c.pctChg*100).toFixed(1)}%</td>
<td style={{...S.td,fontSize:10,fontWeight:600,color:imp>0?P.green:P.red}}>{imp>0?"▲ Tailwind":"▼ Headwind"}</td>
<td style={{...S.td,fontWeight:600,color:imp>0?P.green:P.red}}>${Math.abs(imp).toFixed(1)}M</td></tr>;})}</tbody></table></div></div>
</>)}</>);}

function StateV({ss,setSs,cfs,h}){
const si=ST[ss];const exp=cfs(ss);const sch=h.filter(x=>x.state===ss).sort((a,b)=>b.year-a.year);
const revAtRisk=exp.reduce((a,c)=>a+c.mr*(c.se[ss]||0),0);
return(<>
<div style={{...S.card,borderLeft:"4px solid "+P.green}}>
<p style={S.desc}><strong>State Analysis:</strong> Select a state to see its Medicaid fee schedule characteristics, which public companies have revenue exposure there, current CPT code rates, and historical fee schedule changes. This view helps you understand which companies would be most impacted by fee schedule changes in a specific state.</p></div>
<div style={{display:"flex",gap:12,marginBottom:12,alignItems:"center"}}>
<select style={S.sel} value={ss} onChange={e=>setSs(e.target.value)}>{SL.map(x=><option key={x} value={x}>{x} — {ST[x].n}</option>)}</select>
<span style={{fontSize:13,color:P.greenD,fontFamily:hf}}><strong>{si.n}</strong> — Medicaid/Medicare Ratio: <span style={{color:si.r>=.8?P.green:si.r>=.65?P.gold:P.red,fontWeight:700}}>{(si.r*100).toFixed(0)}%</span></span></div>
<div style={S.grid}>
<div style={S.stat}><div style={S.sN}>{(si.r*100).toFixed(0)}%</div><div style={S.sL}>Medicaid/Medicare Ratio</div></div>
<div style={S.stat}><div style={S.sN}>{exp.length}</div><div style={S.sL}>Exposed Public Cos</div></div>
<div style={{...S.stat,position:"relative"}}><div style={S.sN}>${(revAtRisk/1000).toFixed(1)}B</div><div style={S.sL}>Revenue at Risk</div><div style={{fontSize:9,color:P.g3,marginTop:4,fontFamily:hf}}>Sum of each exposed company's estimated Medicaid revenue attributable to this state (Company Medicaid Rev × State Weight)</div></div>
<div style={S.stat}><div style={S.sN}>{sch.filter(c=>c.year>=2023).length}</div><div style={S.sL}>Changes Since 2023</div></div>
</div>
<div style={S.card}><div style={S.cT}>Companies Exposed to {si.n}</div><div style={S.scroll}><table style={S.tbl}><thead><tr>{["Ticker","Company","Type","Weight","Est State Medicaid Rev","Impact Direction","Key Codes"].map(x=><th key={x} style={S.th}>{x}</th>)}</tr></thead>
<tbody>{exp.map(c=><tr key={c.t}><td style={{...S.td,fontWeight:700,color:P.greenD}}>{c.t}</td><td style={S.td}>{c.n}</td>
<td style={S.td}><span style={c.type==="payer"?S.payBadge:S.provBadge}>{c.type}</span></td>
<td style={{...S.td,fontWeight:600}}>{((c.se[ss]||0)*100).toFixed(1)}%</td>
<td style={S.td}>${((c.se[ss]||0)*c.mr).toFixed(0)}M</td>
<td style={{...S.td,fontSize:10,fontWeight:600,color:c.type==="payer"?P.gold:P.green}}>{c.type==="payer"?"Rate ↑ = Cost headwind":"Rate ↑ = Revenue tailwind"}</td>
<td style={{...S.td,fontSize:10}}>{c.codes.slice(0,6).join(", ")}</td></tr>)}</tbody></table></div></div>
<div style={S.card}><div style={S.cT}>CPT Rates in {si.n} (Top 25 by Medicare Value)</div><p style={S.desc}>Estimated Medicaid rates = Medicare national rate × {si.n}'s Medicaid/Medicare ratio ({(si.r*100).toFixed(0)}%). The "Gap" column shows how much less Medicaid pays compared to Medicare. "Billers" = public companies operating in {si.n} that bill this code.</p>
<div style={S.scroll}><table style={S.tbl}><thead><tr>{["Code","Description","Specialty","Medicare","Medicaid Est","Gap vs Medicare","Public Co Billers"].map(x=><th key={x} style={S.th}>{x}</th>)}</tr></thead>
<tbody>{Object.entries(CPT).sort((a,b)=>b[1].mc-a[1].mc).slice(0,25).map(([c,info])=>{
const mr=+(info.mc*si.r).toFixed(2);const gap=mr-info.mc;const bl=COS.filter(x=>x.codes.includes(c)&&x.se[ss]).map(x=>x.t);
return<tr key={c}><td style={{...S.td,fontWeight:700,color:P.greenD}}>{c}</td><td style={S.td}>{info.d}</td><td style={S.td}>{info.s}</td><td style={S.td}>${info.mc.toFixed(2)}</td><td style={{...S.td,fontWeight:600}}>${mr.toFixed(2)}</td><td style={{...S.td,...S.neg}}>${gap.toFixed(2)}</td><td style={{...S.td,fontSize:10}}>{bl.join(", ")||"—"}</td></tr>;})}</tbody></table></div></div>
<div style={S.card}><div style={S.cT}>Historical Fee Schedule Changes — {si.n}</div><div style={S.scroll}><table style={S.tbl}><thead><tr>{["Year","CPT","Description","Old","New","Change","Affected Cos"].map(x=><th key={x} style={S.th}>{x}</th>)}</tr></thead>
<tbody>{sch.slice(0,30).map((c,i)=>{const aff=affectedCos(c.code,c.state);return<tr key={i}><td style={S.td}>{c.year}</td><td style={{...S.td,fontWeight:700}}>{c.code}</td><td style={S.td}>{CPT[c.code]&&CPT[c.code].d}</td><td style={S.td}>${c.oldRate.toFixed(2)}</td><td style={S.td}>${c.newRate.toFixed(2)}</td><td style={{...S.td,...pc(c.pctChg),fontWeight:600}}>{(c.pctChg*100).toFixed(1)}%</td>
<td style={{...S.td,fontSize:9}}>{aff.map(a=><span key={a.t} style={a.type==="payer"?S.payBadge:S.provBadge}>{a.t}{a.type==="payer"?" ▼":" ▲"}</span>)}</td></tr>;})}</tbody></table></div></div>
</>);}

function CrossSt({sf,setSf}){
const codes=Object.entries(CPT).filter(([,i])=>sf==="All"||i.s===sf).sort((a,b)=>b[1].mc-a[1].mc).slice(0,30);
const mx=Math.max(...codes.flatMap(([,i])=>TS.map(x=>i.mc*ST[x].r)));
return(<>
<div style={{...S.card,borderLeft:"4px solid "+P.green}}>
<p style={S.desc}><strong>Cross-State Matrix:</strong> This heat map shows estimated Medicaid reimbursement rates for each CPT code across 20 major states. Darker cells = higher reimbursement. This lets you quickly identify which states pay the most/least for specific services, and where rate changes would have the largest dollar impact on companies.</p></div>
<div style={{display:"flex",gap:10,marginBottom:12}}>
<select style={S.sel} value={sf} onChange={e=>setSf(e.target.value)}><option value="All">All Specialties</option>{SPECS.map(x=><option key={x} value={x}>{x}</option>)}</select></div>
<div style={{...S.card,...S.scroll}}><table style={S.tbl}><thead><tr>
<th style={{...S.th,minWidth:55}}>Code</th><th style={{...S.th,minWidth:100}}>Desc</th><th style={{...S.th,minWidth:45}}>MC$</th>
{TS.map(x=><th key={x} style={{...S.th,fontSize:9,padding:"6px 2px",minWidth:38,textAlign:"center"}}>{x}</th>)}</tr></thead>
<tbody>{codes.map(([c,info])=><tr key={c}>
<td style={{...S.td,fontWeight:700,color:P.greenD,fontSize:10}}>{c}</td>
<td style={{...S.td,fontSize:9,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{info.d}</td>
<td style={{...S.td,fontSize:10}}>${info.mc.toFixed(0)}</td>
{TS.map(x=>{const r=info.mc*ST[x].r;const op=Math.max(.05,r/mx*.6);return<td key={x} style={{...S.td,fontSize:9,textAlign:"center",background:"rgba(42,125,95,"+op+")",color:op>.3?P.white:P.greenD}}>{r.toFixed(0)}</td>;})}
</tr>)}</tbody></table></div></>);}

function Predict({bt}){
const [lag,setLag]=useState(1);const [tk,setTk]=useState("All");
const prov=COS.filter(c=>c.type==="provider");
const rbl=useMemo(()=>[1,2,3,4].map(l=>{const d=bt.filter(b=>b.lag===l&&(tk==="All"||b.ticker===tk));return{lag:l,...linReg(d.map(b=>b.feeImpact),d.map(b=>b.revGrowth)),n:d.length};}),[bt,tk]);
const crs=useMemo(()=>prov.map(co=>{const d=bt.filter(b=>b.lag===lag&&b.ticker===co.t);const r=linReg(d.map(b=>b.feeImpact),d.map(b=>b.revGrowth));return{...co,...r};}).sort((a,b)=>b.r2-a.r2),[bt,lag]);
const sd=bt.filter(b=>b.lag===lag&&(tk==="All"||b.ticker===tk));
const best=rbl.reduce((b,c)=>c.r2>b.r2?c:b,rbl[0]);
return(<>
<div style={{...S.card,borderLeft:"4px solid "+P.gold}}>
<div style={S.cT}>Predictive Analytics — Methodology & Interpretation</div>
<p style={S.desc}><strong>What this does:</strong> We test whether Medicaid fee schedule changes have statistically significant predictive power for subsequent company revenue growth. This is the core question: <em>if a state raises Medicaid rates for codes a company bills, does that company's revenue actually increase in the following quarters?</em></p>
<p style={S.desc}><strong>How we calculate it:</strong> For each company-quarter, we compute a "Weighted Fee Impact Score" = Σ (each relevant CPT code rate change % × that state's weight in the company's revenue mix). We then run ordinary least squares (OLS) regression of this score against the company's actual subsequent quarterly revenue growth at different time lags (1-4 quarters).</p>
<p style={S.desc}><strong>How to read the results:</strong> <strong>R²</strong> = what percentage of revenue growth variation is explained by fee schedule changes (higher = more predictive). <strong>t-Statistic</strong> = how many standard errors the slope is from zero (|t| > 2 generally means significant). <strong>p-Value</strong> = probability this relationship is due to chance (&lt;0.05 = statistically significant at 95% confidence). <strong>Slope</strong> = for each 1% weighted fee impact, how much does revenue grow? The "Optimal Horizon" is the lag with highest R².</p>
<p style={S.desc}><strong>Why this matters for investing:</strong> If fee schedule changes at Q+1 or Q+2 lag show strong predictive power for a company, it means you can identify revenue tailwinds/headwinds <em>before</em> they show up in earnings. Companies with higher Medicaid revenue concentration (ADUS at 85%, MODV at 92%, NHC at 58%) should theoretically show stronger signals. MCOs are excluded from this analysis because the relationship is inverted and confounded by membership changes.</p>
</div>
<div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
<select style={S.sel} value={lag} onChange={e=>setLag(+e.target.value)}><option value={1}>Q+1 Lag (Next Quarter)</option><option value={2}>Q+2 Lag (2 Quarters)</option><option value={3}>Q+3 Lag (3 Quarters)</option><option value={4}>Q+4 Lag (1 Year)</option></select>
<select style={S.sel} value={tk} onChange={e=>setTk(e.target.value)}><option value="All">All Providers</option>{prov.map(c=><option key={c.t} value={c.t}>{c.t} — {c.n} ({(c.mp*100).toFixed(0)}% Mcaid)</option>)}</select></div>
<div style={S.grid}>
{rbl.map(r=><div key={r.lag} style={{...S.stat,border:r.lag===best.lag?"2px solid "+P.green:"1px solid "+P.g1}}>
<div style={{fontSize:10,color:P.g3,fontFamily:hf}}>Q+{r.lag} Lag ({r.lag===1?"Next Qtr":r.lag===4?"1 Year":r.lag+" Qtrs"})</div>
<div style={{fontSize:24,fontWeight:700,color:r.r2>.15?P.green:r.r2>.05?P.gold:P.red}}>{(r.r2*100).toFixed(1)}%</div>
<div style={{fontSize:9,color:P.g3}}>R² (Explanatory Power)</div>
<div style={{fontSize:11,marginTop:4,fontFamily:hf}}><span style={{color:P.greenD}}>t={r.tStat}</span> <span style={{color:r.pVal<.05?P.green:P.g3}}>p={r.pVal}</span></div>
<div style={{fontSize:9,color:P.g3,marginTop:2}}>n={r.n} observations</div>
{r.lag===best.lag&&<div style={{fontSize:9,color:P.green,marginTop:4,fontWeight:700}}>★ OPTIMAL HORIZON</div>}</div>)}
</div>
<div style={{...S.card,marginTop:12}}>
<div style={S.cT}>Scatter Plot: Fee Impact Score vs Subsequent Revenue Growth</div>
<p style={S.desc}>Each dot is one company-quarter. X-axis = the weighted fee schedule impact score for that quarter. Y-axis = the company's revenue growth {lag} quarter(s) later. A clear upward slope means fee increases are predictive of future revenue growth. Tight clustering around the trend line = higher R².</p>
<div style={{height:280}}><ResponsiveContainer><ScatterChart margin={{bottom:20,left:20}}>
<CartesianGrid strokeDasharray="3 3" stroke={P.g1}/><XAxis dataKey="feeImpact" name="Fee Impact" tick={{fill:P.g3,fontSize:10}} label={{value:"Weighted Fee Impact Score",position:"bottom",fill:P.g3,fontSize:10}}/>
<YAxis dataKey="revGrowth" name="Rev Growth" tick={{fill:P.g3,fontSize:10}} label={{value:"Quarterly Rev Growth",angle:-90,position:"insideLeft",fill:P.g3,fontSize:10}} tickFormatter={v=>(v*100).toFixed(0)+"%"}/>
<Tooltip contentStyle={{background:P.white,border:"1px solid "+P.g2,fontSize:11}} formatter={(v,n)=>[n==="Fee Impact"?v.toFixed(4):(v*100).toFixed(1)+"%",n]}/>
<Scatter data={sd} fill={P.green} fillOpacity={.5}/>
</ScatterChart></ResponsiveContainer></div></div>
<div style={S.card}><div style={S.cT}>Company-Level Signal Strength at Q+{lag} Lag</div>
<p style={S.desc}>Each row shows the regression results for one company in isolation. Companies with higher Medicaid revenue concentration (Mcaid %) should show stronger signals. "Strong" = R² &gt; 15% (fee changes explain a meaningful portion of revenue variation). "Moderate" = 5-15%. "Weak" = &lt; 5%.</p>
<div style={S.scroll}><table style={S.tbl}><thead><tr>{["Ticker","Company","Segment","Mcaid %","R²","Slope","t-Stat","p-Value","Signal Strength"].map(x=><th key={x} style={S.th}>{x}</th>)}</tr></thead>
<tbody>{crs.map(r=><tr key={r.t}><td style={{...S.td,fontWeight:700,color:P.greenD}}>{r.t}</td><td style={S.td}>{r.n}</td><td style={S.td}>{r.seg}</td><td style={S.td}>{(r.mp*100).toFixed(0)}%</td>
<td style={{...S.td,fontWeight:600,color:r.r2>.15?P.green:r.r2>.05?P.gold:P.red}}>{(r.r2*100).toFixed(1)}%</td>
<td style={S.td}>{r.slope}</td><td style={S.td}>{r.tStat}</td>
<td style={{...S.td,color:r.pVal<.05?P.green:P.g3}}>{r.pVal<.05?"<0.05 ✓":r.pVal.toFixed(2)}</td>
<td style={S.td}><span style={{...S.badge,background:r.r2>.15?P.greenXL:r.r2>.05?P.gold+"20":P.red+"20",color:r.r2>.15?P.green:r.r2>.05?P.gold:P.red}}>{r.r2>.15?"Strong":r.r2>.05?"Moderate":"Weak"}</span></td></tr>)}</tbody></table></div></div>
</>);}
