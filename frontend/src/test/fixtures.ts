import type { DashboardData, FinancialsData, MeData } from '@/lib/api';

// Synthetic dashboard fixture (MBI-34) — a self-contained Monday-view payload for render
// tests, independent of the runtime lib/data mock that MBI-35 removes. Captured from the
// sample composition; all values are synthetic (no real PHI).
export const dashboardMonday = {
  "view": "monday",
  "owner": "Dr. Romano",
  "dates": {
    "monday": "Monday, June 22, 2026",
    "weekday": "Thursday, June 25, 2026"
  },
  "weekNumber": 16,
  "metrics": [
    {
      "key": "new_patients",
      "label": "New patients",
      "last": 22,
      "prior": 18
    },
    {
      "key": "medical_seen",
      "label": "Medical seen",
      "last": 284,
      "prior": 271
    },
    {
      "key": "n1",
      "label": "N1 visits",
      "last": 187,
      "prior": 192
    },
    {
      "key": "chiro_seen",
      "label": "Chiropractic seen",
      "last": 612,
      "prior": 598
    },
    {
      "key": "admin_codes",
      "label": "Admin codes",
      "last": 94,
      "prior": 88
    },
    {
      "key": "allergy_tests",
      "label": "Allergy tests",
      "last": 14,
      "prior": 11
    },
    {
      "key": "allergy_kits",
      "label": "Allergy kits dispersed",
      "last": 9,
      "prior": 12
    },
    {
      "key": "recovery_new",
      "label": "Recovery — new",
      "last": 17,
      "prior": 13
    },
    {
      "key": "recovery_all",
      "label": "Recovery — all",
      "last": 142,
      "prior": 129
    },
    {
      "key": "pod",
      "label": "Podiatry",
      "last": 78,
      "prior": 82
    },
    {
      "key": "acu",
      "label": "Acupuncture",
      "last": 56,
      "prior": 61
    },
    {
      "key": "procedures",
      "label": "Procedures",
      "last": 31,
      "prior": 28
    }
  ],
  "totalEncounters": {
    "last": 1547,
    "prior": 1489
  },
  "financialWeek": {
    "depositsByDay": [
      {
        "day": "Mon",
        "amount": 58420
      },
      {
        "day": "Tue",
        "amount": 71210
      },
      {
        "day": "Wed",
        "amount": 64890
      },
      {
        "day": "Thu",
        "amount": 59140
      },
      {
        "day": "Fri",
        "amount": 58720
      }
    ],
    "totalDeposits": {
      "last": 312380,
      "prior": 298640
    },
    "variableSpend": {
      "last": 87440,
      "prior": 91200
    },
    "netContribution": {
      "last": 224940,
      "prior": 207440
    },
    "topCategory": {
      "name": "Med supplies",
      "amount": 24000
    }
  },
  "financialDay": {
    "depositYesterday": {
      "breakdown": [
        {
          "label": "Card batch — AM",
          "amount": 22140
        },
        {
          "label": "Card batch — PM",
          "amount": 28640
        },
        {
          "label": "Insurance ACH",
          "amount": 7640
        }
      ],
      "total": 58420,
      "prior": 54180,
      "account": "Business operating account",
      "posted": "Posted 06:42 ET"
    },
    "variableSpend": {
      "yesterday": {
        "last": 14210,
        "prior": 12980
      },
      "wtd": 48640,
      "mtd": 214820,
      "topCategories": [
        {
          "name": "Med supplies",
          "amount": 62140
        },
        {
          "name": "Lab / regenerative",
          "amount": 48290
        },
        {
          "name": "Marketing",
          "amount": 31420
        }
      ]
    }
  },
  "schedule": [
    {
      "time": "08:00",
      "end": "08:30",
      "title": "Clinic open / staff huddle",
      "detail": "Front desk · full team",
      "location": "Front desk",
      "description": "Daily huddle — yesterday’s no-shows, today’s schedule risks, recovery-suite room turnover.",
      "organizer": "Dr. Romano",
      "attendees": [
        {
          "name": "Front desk lead",
          "response": "accepted"
        },
        {
          "name": "Hetal · Billing",
          "response": "accepted"
        },
        {
          "name": "Provider team",
          "response": "tentative"
        }
      ]
    },
    {
      "time": "09:30",
      "end": "10:15",
      "title": "UB-04 transition review",
      "detail": "with Hetal (Billing)",
      "location": "Microsoft Teams",
      "description": "Walk the UB-04 model and the two payer edge cases before the Wednesday decision meeting.",
      "joinUrl": "https://teams.microsoft.com/l/meetup-join/sample-ub04",
      "organizer": "Hetal · Billing",
      "attendees": [
        {
          "name": "Dr. Romano",
          "response": "accepted"
        },
        {
          "name": "Hetal · Billing",
          "response": "accepted"
        }
      ]
    },
    {
      "time": "11:00",
      "end": "11:45",
      "title": "Wearable pilot — scoping call",
      "detail": "Research lab",
      "location": "Microsoft Teams",
      "description": "Scope the pilot protocol and data-sharing terms. Confirm Tue/Wed for the follow-up.",
      "joinUrl": "https://teams.microsoft.com/l/meetup-join/sample-wearable",
      "organizer": "Dr. Romano",
      "attendees": [
        {
          "name": "Dr. Romano",
          "response": "accepted"
        },
        {
          "name": "Research lab",
          "response": "accepted"
        }
      ]
    },
    {
      "time": "12:30",
      "end": "13:00",
      "title": "Provider 1:1 — onboarding",
      "detail": "Dr. Ianuzzi · onboarding progress",
      "location": "Office",
      "description": "Track-C onboarding check-in: peptide deck review status, IG Live segment this week.",
      "organizer": "Dr. Romano",
      "attendees": [
        {
          "name": "Dr. Ianuzzi",
          "response": "accepted"
        }
      ]
    },
    {
      "time": "14:00",
      "end": "14:30",
      "title": "Open slot",
      "detail": "2pm patient moved",
      "open": true
    },
    {
      "time": "16:30",
      "end": "17:15",
      "title": "Peptide protocol review",
      "detail": "Regenerative team",
      "location": "Recovery suite",
      "description": "Sign off handout v3 and confirm the reorder cold-chain timing for Thursday.",
      "organizer": "Dr. Romano",
      "attendees": [
        {
          "name": "Regenerative team",
          "response": "accepted"
        },
        {
          "name": "Dr. Ianuzzi",
          "response": "tentative"
        }
      ]
    }
  ],
  "weekCalendar": [
    {
      "day": "MON",
      "long": "Monday",
      "count": 3,
      "today": true,
      "events": [
        {
          "time": "08:00",
          "title": "Staff huddle",
          "detail": "Front desk"
        },
        {
          "time": "09:00",
          "title": "Weekly leadership sync",
          "detail": "Microsoft Teams",
          "joinUrl": "https://teams.microsoft.com/l/meetup-join/sample-lead"
        },
        {
          "time": "15:00",
          "title": "Payer call — commercial plans",
          "detail": "Aetna / Horizon"
        }
      ]
    },
    {
      "day": "TUE",
      "long": "Tuesday",
      "count": 4,
      "events": [
        {
          "time": "08:00",
          "title": "Staff huddle",
          "detail": "Front desk"
        },
        {
          "time": "10:00",
          "title": "N1 conversion SOP — MA walkthrough",
          "detail": "Training room"
        },
        {
          "time": "13:30",
          "title": "Vendor demo — regenerative supplier",
          "detail": "Microsoft Teams",
          "joinUrl": "https://teams.microsoft.com/l/meetup-join/sample-vendor"
        },
        {
          "time": "16:00",
          "title": "Recovery suite walkthrough",
          "detail": "Recovery suite"
        }
      ]
    },
    {
      "day": "WED",
      "long": "Wednesday",
      "count": 5,
      "events": [
        {
          "time": "08:00",
          "title": "Staff huddle",
          "detail": "Front desk"
        },
        {
          "time": "09:30",
          "title": "Provider 1:1",
          "detail": "Office"
        },
        {
          "time": "11:00",
          "title": "UB-04 final decision meeting",
          "detail": "with Hetal · Microsoft Teams",
          "joinUrl": "https://teams.microsoft.com/l/meetup-join/sample-ub04-final"
        },
        {
          "time": "14:00",
          "title": "Allergy program review",
          "detail": "Clinical"
        },
        {
          "time": "16:00",
          "title": "Cryotherapy chamber — service review",
          "detail": "Vendor"
        }
      ]
    },
    {
      "day": "THU",
      "long": "Thursday",
      "count": 4,
      "events": [
        {
          "time": "08:00",
          "title": "Staff huddle",
          "detail": "Front desk"
        },
        {
          "time": "12:00",
          "title": "Social — IG Live segment prep",
          "detail": "with Social manager"
        },
        {
          "time": "15:00",
          "title": "Vendor demo (regenerative)",
          "detail": "Microsoft Teams",
          "joinUrl": "https://teams.microsoft.com/l/meetup-join/sample-regen"
        },
        {
          "time": "18:00",
          "title": "IG Live segment",
          "detail": "Evening · Social"
        }
      ]
    },
    {
      "day": "FRI",
      "long": "Friday",
      "count": 3,
      "events": [
        {
          "time": "08:00",
          "title": "Staff huddle",
          "detail": "Front desk"
        },
        {
          "time": "10:00",
          "title": "Recovery suite ROI review",
          "detail": "Recovery suite"
        },
        {
          "time": "16:30",
          "title": "Peptide protocol sign-off",
          "detail": "Regenerative team"
        }
      ]
    }
  ],
  "emails": [
    {
      "id": "e1",
      "unread": true,
      "important": true,
      "category": "action-needed",
      "from": "Hetal — Billing",
      "subject": "UB-04 analysis ready",
      "preview": "Numbers are in for the transition model — needs your sign-off before the Wed meeting.",
      "time": "Last night · 23:14",
      "body": "Hi Dr. Romano — I've finished the UB-04 transition model. The headline numbers look workable but I want your sign-off before Wednesday's decision meeting. I flagged two payer edge cases in the sheet. Can we cover them at the 10am review?"
    },
    {
      "id": "e2",
      "unread": true,
      "important": true,
      "category": "management",
      "from": "Research lab",
      "subject": "Positive reply — wearable pilot",
      "preview": "They are interested and want to schedule a call next week to scope the pilot protocol.",
      "time": "Today · 07:55",
      "body": "Thanks for the outreach. We reviewed the proposal and would like to move ahead with a scoping call next week. Tuesday or Wednesday afternoon works on our side. We can walk through the pilot protocol and data-sharing terms."
    },
    {
      "id": "e3",
      "unread": true,
      "important": false,
      "category": "operational",
      "from": "Billing system support",
      "subject": "Coding question — follow-up",
      "preview": "Following up on the place-of-service coding question from last week.",
      "time": "Today · 09:10",
      "body": "Following up on your place-of-service classification question. We've routed it to the billing configuration team; expect a response within two business days. Let us know if anything is urgent."
    },
    {
      "id": "e4",
      "unread": false,
      "important": false,
      "category": "operational",
      "from": "Commercial payer relations",
      "subject": "Provider notice — network update",
      "preview": "Routine network bulletin. No action required at this time.",
      "time": "Yesterday · 16:20",
      "body": "This is a routine provider network bulletin regarding upcoming portal maintenance. No action is required at this time. Full details are attached."
    },
    {
      "id": "e5",
      "unread": false,
      "important": true,
      "category": "operational",
      "from": "Front desk lead",
      "subject": "N1 conversion SOP — draft 2",
      "preview": "Second draft of the rollout plan for the MAs, ready for your review.",
      "time": "Yesterday · 14:02",
      "body": "Attached is draft 2 of the N1 conversion SOP for the medical assistants. I incorporated your notes on the intake script. If this looks good I'll schedule the team walkthrough for Thursday."
    },
    {
      "id": "e6",
      "unread": true,
      "important": true,
      "category": "management",
      "from": "Practice manager",
      "subject": "Monday provider report — ready",
      "preview": "This week's provider spreadsheet is finalized and shared to the team folder.",
      "time": "Today · 06:48",
      "body": "Morning — the weekly provider report is done and in the shared folder. Encounters are up across chiro and recovery; allergy kits dipped. Flagging it so it's on your Monday view."
    },
    {
      "id": "e7",
      "unread": true,
      "important": false,
      "category": "operational",
      "from": "Regenerative supplier",
      "subject": "Reorder confirmation",
      "preview": "Your peptide protocol reorder is confirmed and ships Thursday.",
      "time": "Today · 08:20",
      "body": "This confirms your regenerative protocol reorder. Expected to ship Thursday with standard cold-chain handling. Reply here if quantities need adjusting."
    },
    {
      "id": "e8",
      "unread": true,
      "important": false,
      "category": "operational",
      "from": "IT support",
      "subject": "Mailbox storage notice",
      "preview": "Routine notice — your mailbox is at 70% of its storage quota.",
      "time": "Yesterday · 18:05",
      "body": "Routine maintenance notice: your mailbox has reached 70% of its storage quota. No action is required yet; we will archive older items automatically."
    }
  ],
  "awaiting": [
    {
      "id": "a1",
      "days": 7,
      "wait": "7d",
      "to": "University lab",
      "subject": "Wearable outreach",
      "detail": "No reply since the initial intro email"
    },
    {
      "id": "a2",
      "days": 5,
      "wait": "5d",
      "to": "Payer provider relations",
      "subject": "UB-04 question",
      "detail": "Awaiting clarification on the payer requirement"
    },
    {
      "id": "a3",
      "days": 3,
      "wait": "3d",
      "to": "Cryotherapy vendor",
      "subject": "Chamber service quote",
      "detail": "Requested a service + maintenance quote"
    },
    {
      "id": "a4",
      "days": 2,
      "wait": "2d",
      "to": "Social manager",
      "subject": "Live segment brief",
      "detail": "Confirmation needed on the Thursday slot"
    }
  ],
  "tasks": [
    {
      "id": "t1",
      "title": "Reply to Hetal — UB-04 model",
      "owner": "DCR",
      "due": "Before 10am",
      "status": "due-today"
    },
    {
      "id": "t2",
      "title": "Confirm wearable scoping call slot",
      "owner": "DCR",
      "due": "Tue or Wed",
      "status": "due-today"
    },
    {
      "id": "t3",
      "title": "Recovery Suite ROI model v3",
      "owner": "DCR",
      "due": "Fri",
      "status": "upcoming"
    },
    {
      "id": "t4",
      "title": "Sign off peptide handout v3",
      "owner": "DCR",
      "due": "Mon next",
      "status": "overdue"
    },
    {
      "id": "t5",
      "title": "Recovery suite walkthrough notes",
      "owner": "DCR",
      "due": "For ROI v3",
      "status": "upcoming"
    },
    {
      "id": "t6",
      "title": "Pilot protocol v2 draft",
      "owner": "DCR",
      "due": "Fri",
      "status": "upcoming"
    },
    {
      "id": "t7",
      "title": "UB-04 transition — final recommendation",
      "owner": "HETAL",
      "due": "Wed",
      "status": "due-today"
    },
    {
      "id": "t8",
      "title": "Payer call notes — commercial plans",
      "owner": "HETAL",
      "due": "Thu",
      "status": "upcoming"
    },
    {
      "id": "t9",
      "title": "Reconcile front-desk vs deposit gap",
      "owner": "HETAL",
      "due": "Fri",
      "status": "upcoming"
    },
    {
      "id": "t10",
      "title": "Live segment confirmation",
      "owner": "SOCIAL",
      "due": "Yesterday",
      "status": "overdue"
    },
    {
      "id": "t11",
      "title": "Recovery suite content calendar",
      "owner": "SOCIAL",
      "due": "Thu",
      "status": "upcoming"
    },
    {
      "id": "t14",
      "title": "N1 conversion SOP rollout to MAs",
      "owner": "FRONT",
      "due": "Thu",
      "status": "upcoming"
    },
    {
      "id": "t15",
      "title": "Intake script update",
      "owner": "FRONT",
      "due": "Fri",
      "status": "upcoming"
    },
    {
      "id": "t16",
      "title": "Peptide deck review",
      "owner": "PROVIDER",
      "due": "Mon next",
      "status": "upcoming"
    }
  ],
  "priorityToday": [
    {
      "id": "t4",
      "title": "Sign off peptide handout v3",
      "owner": "DCR",
      "due": "Mon next",
      "status": "overdue"
    },
    {
      "id": "t10",
      "title": "Live segment confirmation",
      "owner": "SOCIAL",
      "due": "Yesterday",
      "status": "overdue"
    },
    {
      "id": "t1",
      "title": "Reply to Hetal — UB-04 model",
      "owner": "DCR",
      "due": "Before 10am",
      "status": "due-today"
    },
    {
      "id": "t2",
      "title": "Confirm wearable scoping call slot",
      "owner": "DCR",
      "due": "Tue or Wed",
      "status": "due-today"
    },
    {
      "id": "t7",
      "title": "UB-04 transition — final recommendation",
      "owner": "HETAL",
      "due": "Wed",
      "status": "due-today"
    }
  ],
  "awaitingThresholdHours": 48
} as DashboardData;

// Weekday-view payload — same underlying synthetic data, view flipped. The live BFF
// returns the same shape with `view: 'weekday'`; the Daily composition reads
// financialDay / emails / schedule / priorityToday (all present above).
export const dashboardWeekday: DashboardData = { ...dashboardMonday, view: 'weekday' };

// Financials getter payload, derived from the dashboard's weekly + daily figures.
export const financialsFixture: FinancialsData = {
  weekly: dashboardMonday.financialWeek!,
  daily: dashboardMonday.financialDay!,
  // Accrual revenue (MAD-23) — reads higher than cash deposits by design. Sample only.
  revenue: { weekly: { last: 288400, prior: 271500 }, mtd: 542900 },
};

// Signed-in profile (the live /api/me shape). Synthetic.
export const meFixture: MeData = { displayName: dashboardMonday.owner, mail: '' };
