import React from "react";
import Link from "next/link";
import {
  Appointment,
  Department,
  FreeCamp,
  LabRegistration,
  PatientLookupResult,
  User,
  WeekDayName,
  WeeklySchedule,
} from "../../types";
import {
  Calendar,
  Clock,
  Eye,
  EyeOff,
  PlusCircle,
  Printer,
  Search,
  Users,
} from "lucide-react";
import {
  cancelAppointment,
  checkPaytmPosPayment,
  createCounterAppointment,
  createRegistration,
  getDoctorAvailability,
  initiatePaytmPosPayment,
  listAllAppointments,
  listDepartments,
  listDoctors,
  listFreeCamps,
  listRegistrations,
  lookupPatientsByPhone,
  markAppointmentConsulted,
  recordAppointmentRefund,
  recordCashPayment,
  recordManualPosPayment,
  recordReceiptPrint,
  resetAccountPassword,
  rescheduleAppointment,
  searchExistingPatients,
} from "../../services/clinicService";
import RegistrationEditor from "../../components/RegistrationEditor";
import PasswordInput from "../../components/PasswordInput";

const emptyForm = {
  name: "",
  phoneNo: "",
  address: "",
  age: "",
  gender: "",
  nativePlace: "",
  departmentId: "",
  campId: "",
  doctorId: "",
  time: "",
  existingPatientId: "",
  createSeparatePatient: false,
  isFreeCamp: true,
  enablePortalLogin: false,
  portalPassword: "",
  confirmPortalPassword: "",
};
const escapeReceiptValue = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] || character,
  );
const Required = ({ children }: { children: React.ReactNode }) => (
  <>
    {children} <span className="text-red-600">*</span>
  </>
);
const clinicDate = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const doctorSchedule = (doctor?: User): WeeklySchedule => {
  if (!doctor) return {};
  if (doctor.weeklySchedule && Object.keys(doctor.weeklySchedule).length)
    return doctor.weeklySchedule;
  const schedule: WeeklySchedule = {};
  doctor.availableDays?.forEach((day) => {
    schedule[day as WeekDayName] = [
      {
        start: doctor.workingHours?.start || "09:00",
        end: doctor.workingHours?.end || "17:00",
      },
    ];
  });
  return schedule;
};

const CounterDashboard: React.FC<{ user: User }> = () => {
  const [registrations, setRegistrations] = React.useState<LabRegistration[]>(
    [],
  );
  const [camps, setCamps] = React.useState<FreeCamp[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [doctors, setDoctors] = React.useState<User[]>([]);
  const [booking, setBooking] = React.useState({
    patientId: "",
    doctorId: "",
    date: "",
    time: "",
    followUpOf: "",
  });
  const [bookingDepartment, setBookingDepartment] = React.useState("");
  const [bookingPaymentMethod, setBookingPaymentMethod] = React.useState<
    "CASH" | "PAYTM_POS"
  >("CASH");
  const [concessionPercent, setConcessionPercent] = React.useState(0);
  const [concessionReason, setConcessionReason] = React.useState("");
  const [historicalEntry, setHistoricalEntry] = React.useState(false);
  const [historicalReason, setHistoricalReason] = React.useState("");
  const [passwordTarget, setPasswordTarget] =
    React.useState<PatientLookupResult | null>(null);
  const [resetPassword, setResetPassword] = React.useState("");
  const [resetPasswordConfirmation, setResetPasswordConfirmation] =
    React.useState("");
  const [bookingBusy, setBookingBusy] = React.useState(false);
  const [patientSearch, setPatientSearch] = React.useState("");
  const [patientResults, setPatientResults] = React.useState<
    PatientLookupResult[]
  >([]);
  const [selectedBookingPatient, setSelectedBookingPatient] =
    React.useState<PatientLookupResult | null>(null);
  const [slots, setSlots] = React.useState<string[]>([]);
  const [campSlots, setCampSlots] = React.useState<string[]>([]);
  const [matches, setMatches] = React.useState<PatientLookupResult[]>([]);
  const [form, setForm] = React.useState(emptyForm);
  const [receipt, setReceipt] = React.useState<LabRegistration | null>(null);
  const [consultationReceipt, setConsultationReceipt] =
    React.useState<Appointment | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [showPortalPassword, setShowPortalPassword] = React.useState(false);
  const today = clinicDate(new Date());
  const todayRegistrations = registrations.filter(
    (row) => clinicDate(new Date(row.createdAt)) === today,
  );
  const todayAppointments = appointments.filter((row) => row.date === today);
  const reconciliationAppointments = appointments
    .filter(
      (row) =>
        row.paymentStatus === "Confirmed" &&
        !["Completed", "Cancelled", "Rescheduled"].includes(row.status),
    )
    .slice(0, 50);

  const load = () =>
    Promise.all([
      listRegistrations(),
      listFreeCamps(),
      listDepartments(),
      listAllAppointments(),
      listDoctors(),
    ]).then(([rows, campRows, departmentRows, appointmentRows, doctorRows]) => {
      setRegistrations(rows);
      setCamps(
        campRows.filter((camp) => camp.isActive && camp.status === "OPEN"),
      );
      setDepartments(departmentRows);
      setAppointments(appointmentRows);
      setDoctors(doctorRows);
    });
  React.useEffect(() => {
    load().catch(() => setMessage("Unable to load counter registration data."));
  }, []);
  const camp = camps.find((row) => row.id === form.campId);
  const availableDepartments = form.isFreeCamp
    ? camp?.departments || []
    : departments;
  const campDoctors = doctors.filter(
    (doctor) =>
      doctor.department ===
      availableDepartments.find(
        (department) => department.id === form.departmentId,
      )?.name,
  );
  React.useEffect(() => {
    if (form.isFreeCamp && form.doctorId && camp?.date)
      getDoctorAvailability(form.doctorId, camp.date)
        .then(setCampSlots)
        .catch(() => setCampSlots([]));
    else setCampSlots([]);
  }, [form.isFreeCamp, form.doctorId, camp?.date]);

  const lookup = async () => {
    setMessage("");
    setMatches([]);
    if (form.phoneNo.length !== 10) return;
    try {
      const rows = await lookupPatientsByPhone(form.phoneNo, form.name);
      setMatches(rows);
      const exact = rows.find((row) => row.exactMatch);
      if (exact) {
        setForm((current) => ({
          ...current,
          existingPatientId: exact.userId,
          createSeparatePatient: false,
          name: exact.name,
          address: exact.address,
          age: exact.age == null ? "" : String(exact.age),
          gender: exact.gender,
          nativePlace: exact.nativePlace || "",
          enablePortalLogin: false,
          portalPassword: "",
          confirmPortalPassword: "",
        }));
        setMessage(
          `Existing patient found: ${exact.patientId}. Details were filled automatically.`,
        );
      } else if (rows.length)
        setMessage(
          "This mobile number exists, but the name does not match. Select the correct patient or create a separate patient.",
        );
      else
        setMessage(
          "No existing patient found. A new BHCC patient ID will be created.",
        );
    } catch (error: any) {
      setMessage(error?.message || "Patient lookup failed.");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    if (
      form.enablePortalLogin &&
      form.portalPassword !== form.confirmPortalPassword
    ) {
      setMessage("Portal passwords do not match.");
      setSaving(false);
      return;
    }
    try {
      const row = await createRegistration({
        ...form,
        portalPassword: form.enablePortalLogin ? form.portalPassword : "",
      });
      setRegistrations((previous) => [row, ...previous]);
      setReceipt(row.isFreeCamp ? row : null);
      setForm(emptyForm);
      setMatches([]);
      setMessage(`Registered successfully with patient ID ${row.patientId}.`);
    } catch (error: any) {
      setMessage(error?.message || "Registration failed.");
    } finally {
      setSaving(false);
    }
  };

  const printReceipt = () => {
    if (!receipt) return;
    const printWindow = window.open("", "_blank", "width=420,height=600");
    if (!printWindow) {
      setMessage("Allow pop-ups for this website to print the receipt.");
      return;
    }
    const rows = [
      ["Patient Name :", receipt.name],
      ["Mobile :", receipt.phoneNo],
      ["Patient ID :", receipt.patientId],
      ["Department :", receipt.departmentName],
      ["Department Token :", receipt.tokenNumber],
    ];
    printWindow.document
      .write(`<!doctype html><html><head><meta charset="UTF-8"><title>Camp receipt</title><style>
      *{box-sizing:border-box;font-weight:900!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;width:80mm;background:#eee;color:#000}
      body{padding:20px;font-family:"Courier New",Courier,monospace;font-size:13px;font-weight:900;-webkit-text-stroke:.18px #000}.receipt{width:80mm;margin:0;padding:4mm 3mm;background:#fff}
      .hospital-name{text-align:center;font-size:16px;line-height:18px;margin-bottom:5px}.camp-name{text-align:center;font-size:14px;line-height:17px;margin-bottom:8px}.line{border-top:1px dashed #000;margin:7px 0}
      .field{display:flex;width:100%;line-height:20px}.label{flex:0 0 46%;text-align:left;white-space:nowrap}.value{flex:1;min-width:0;text-align:right;overflow-wrap:anywhere}.token{margin-top:3px}.footer{margin-top:8px;text-align:center;font-size:13px}
      @media print{html,body{width:80mm;margin:0;padding:0;background:#fff}.receipt{width:80mm;margin:0;padding:4mm 3mm}}
    </style></head><body><section class="receipt"><div class="hospital-name">BHAKTIVEDANTA<br>HEALTH CARE CENTER</div><div class="camp-name">${escapeReceiptValue(receipt.campName)}</div><div class="line"></div>${rows.map(([label, value], index) => `<div class="field${index === rows.length - 1 ? " token" : ""}"><div class="label">${label}</div><div class="value">${escapeReceiptValue(value)}</div></div>`).join("")}<div class="line"></div><div class="footer">Hare Krishna!</div></section></body></html>`);
    printWindow.document.close();
    printWindow.addEventListener("afterprint", () => printWindow.close(), {
      once: true,
    });
    window.setTimeout(() => {
      const element = printWindow.document.querySelector(
        ".receipt",
      ) as HTMLElement | null;
      const height = Math.max(
        45,
        Math.ceil(((element?.scrollHeight || 0) * 25.4) / 96) + 1,
      );
      const style = printWindow.document.createElement("style");
      style.textContent = `@page{size:80mm ${height}mm;margin:0}`;
      printWindow.document.head.appendChild(style);
      printWindow.focus();
      printWindow.print();
    }, 250);
    void recordReceiptPrint(receipt.id).catch(() =>
      setMessage("Receipt opened, but its print audit could not be recorded."),
    );
  };

  const printConsultationReceipt = (appointment: Appointment) => {
    const printWindow = window.open("", "_blank", "width=420,height=650");
    if (!printWindow) {
      setMessage(
        "Allow pop-ups for this website to print the consultation receipt.",
      );
      return;
    }
    const paymentMode =
      appointment.paymentMethod === "CASH"
        ? "Cash"
        : appointment.paymentMethod === "FREE_FOLLOW_UP"
          ? "Free Follow-up"
          : "Paytm POS";
    const paidAmount =
      appointment.paymentMethod === "FREE_FOLLOW_UP"
        ? 0
        : Math.max(
            0,
            (appointment.baseConsultationFee ?? appointment.fee) -
              (appointment.concessionAmount ?? 0),
          );
    const formattedDate = new Date(
      `${appointment.date}T00:00:00`,
    ).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const rows = [
      ["Patient Name :", appointment.patientName],
      ["Mobile :", appointment.patientMobile || "—"],
      [
        "Age / Gender :",
        [appointment.patientAge, appointment.patientGender]
          .filter(
            (value) => value !== null && value !== undefined && value !== "",
          )
          .join(" / ") || "—",
      ],
      ["Patient ID :", appointment.patientId],
      ["Department :", appointment.department],
      ["Doctor Name :", appointment.doctorName],
      ["Date :", formattedDate],
      ["Time :", appointment.time],
      ["Token :", appointment.tokenNumber || "—"],
      ...(appointment.concessionPercent
        ? [
            [
              "Standard Fee :",
              `₹${(appointment.baseConsultationFee ?? appointment.fee).toLocaleString("en-IN")}`,
            ],
            [
              `Concession (${appointment.concessionPercent}%) :`,
              `-₹${(appointment.concessionAmount ?? 0).toLocaleString("en-IN")}`,
            ],
            ["Reason :", appointment.concessionReason || "—"],
          ]
        : []),
    ];
    printWindow.document
      .write(`<!doctype html><html><head><meta charset="UTF-8"><title>Consultation receipt</title><style>
      *{box-sizing:border-box;font-weight:900!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;width:80mm;background:#eee;color:#000}
      body{padding:20px;font-family:"Courier New",Courier,monospace;font-size:13px;font-weight:900;-webkit-text-stroke:.18px #000}.receipt{width:80mm;margin:0;padding:4mm 3mm;background:#fff}
      .center{text-align:center}.hospital-name{font-size:16px;line-height:18px;margin-bottom:5px}.title{font-size:14px;line-height:17px;margin-bottom:8px}.line{border-top:1px dashed #000;margin:7px 0}
      .field{display:flex;width:100%;line-height:20px}.label{flex:0 0 46%;text-align:left;white-space:nowrap}.value{flex:1;min-width:0;text-align:right;overflow-wrap:anywhere}.paid{font-size:14px;line-height:22px}.footer{margin-top:8px;text-align:center;font-size:13px}
      @media print{html,body{width:80mm;margin:0;padding:0;background:#fff}.receipt{width:80mm;margin:0;padding:4mm 3mm}}
    </style></head><body><section class="receipt"><div class="center hospital-name">BHAKTIVEDANTA<br>HEALTH CARE CENTER</div><div class="center title">CONSULTATION RECEIPT</div><div class="line"></div>${rows.map(([label, value]) => `<div class="field"><div class="label">${label}</div><div class="value">${escapeReceiptValue(value)}</div></div>`).join("")}<div class="line"></div><div class="field paid"><div class="label">Consultation Paid :</div><div class="value">₹${paidAmount.toLocaleString("en-IN")}</div></div><div class="field"><div class="label">Payment Mode :</div><div class="value">${escapeReceiptValue(paymentMode)}</div></div>${appointment.paymentReference ? `<div class="field"><div class="label">Reference :</div><div class="value">${escapeReceiptValue(appointment.paymentReference)}</div></div>` : ""}<div class="line"></div><div class="footer">Hare Krishna!</div></section></body></html>`);
    printWindow.document.close();
    printWindow.addEventListener("afterprint", () => printWindow.close(), {
      once: true,
    });
    window.setTimeout(() => {
      const element = printWindow.document.querySelector(
        ".receipt",
      ) as HTMLElement | null;
      const height = Math.max(
        55,
        Math.ceil(((element?.scrollHeight || 0) * 25.4) / 96) + 1,
      );
      const style = printWindow.document.createElement("style");
      style.textContent = `@page{size:80mm ${height}mm;margin:0}`;
      printWindow.document.head.appendChild(style);
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  const recordPosPayment = async (appointment: Appointment) => {
    const reference = window.prompt(
      `Enter the Paytm POS receipt/reference for ${appointment.patientName}.\nAmount: ₹${appointment.fee}`,
      appointment.paymentReference || "",
    );
    if (reference === null) return;
    if (reference.trim().length < 4) {
      setMessage("Enter a valid Paytm POS receipt/reference.");
      return;
    }
    try {
      const updated = await recordManualPosPayment(
        appointment.id,
        reference.trim(),
      );
      setAppointments((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      setConsultationReceipt(updated);
      setMessage(
        `Payment recorded for ${updated.patientName}. Reference: ${updated.paymentReference}`,
      );
    } catch (error: any) {
      setMessage(error?.message || "Could not record the POS payment.");
    }
  };

  const recordCash = async (appointment: Appointment) => {
    if (
      !window.confirm(
        `Confirm cash received from ${appointment.patientName}.\nAmount: ₹${appointment.fee.toLocaleString("en-IN")}`,
      )
    )
      return;
    try {
      const updated = await recordCashPayment(appointment.id);
      setAppointments((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      setConsultationReceipt(updated);
      setMessage(`Cash payment recorded for ${updated.patientName}.`);
    } catch (error: any) {
      setMessage(error?.message || "Could not record the cash payment.");
    }
  };

  const runAutomaticPos = async (
    appointment: Appointment,
    checkOnly = false,
  ) => {
    try {
      const updated = checkOnly
        ? await checkPaytmPosPayment(appointment.id)
        : await initiatePaytmPosPayment(appointment.id);
      setAppointments((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      if (updated.paymentStatus === "Confirmed")
        setConsultationReceipt(updated);
      setMessage(
        checkOnly
          ? `Paytm status: ${updated.paymentStatus}`
          : "Payment sent to the Paytm POS. Complete it on the machine, then check status.",
      );
    } catch (error: any) {
      setMessage(
        error?.message ||
          "Paytm POS request failed. Manual receipt entry remains available.",
      );
    }
  };

  const cancelCounterAppointment = async (appointment: Appointment) => {
    const reason = window.prompt(
      `Why is ${appointment.patientName}'s appointment being cancelled?`,
      "Patient requested cancellation",
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setMessage("Enter a short cancellation reason.");
      return;
    }
    if (
      !window.confirm(
        "Cancel this appointment? Its slot will immediately become available again.",
      )
    )
      return;
    try {
      const updated = await cancelAppointment(appointment.id, reason.trim());
      setAppointments((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      const refundMessage =
        updated.refundStatus === "Pending"
          ? ` Refund pending through ${updated.refundMethod === "CASH" ? "cash" : "Paytm POS"}.`
          : updated.refundStatus === "Initiated"
            ? " Online refund initiated to the original payment source."
            : " No refund is required.";
      setMessage(
        `Appointment cancelled and the slot reopened.${refundMessage}`,
      );
    } catch (error: any) {
      setMessage(error?.message || "Could not cancel the appointment.");
    }
  };

  const rescheduleCounterAppointment = async (appointment: Appointment) => {
    const nextDate = window.prompt(
      "Enter the new date (YYYY-MM-DD):",
      appointment.date,
    );
    if (!nextDate) return;
    try {
      const available = await getDoctorAvailability(
        appointment.doctorId,
        nextDate.trim(),
      );
      if (!available.length) {
        setMessage(
          "No available slots exist for that doctor on the selected date.",
        );
        return;
      }
      const nextTime = window.prompt(
        `Enter one available time:\n${available.join(", ")}`,
        available[0],
      );
      if (!nextTime) return;
      if (!available.includes(nextTime.trim())) {
        setMessage("Select one of the displayed available slots.");
        return;
      }
      const reason = window.prompt(
        "Enter the reason for rescheduling:",
        "Patient requested rescheduling",
      );
      if (!reason || reason.trim().length < 3) {
        setMessage("Enter a short rescheduling reason.");
        return;
      }
      const updated = await rescheduleAppointment(
        appointment.id,
        nextDate.trim(),
        nextTime.trim(),
        reason.trim(),
      );
      setAppointments((current) => [
        updated,
        ...current.map((row) =>
          row.id === appointment.id
            ? {
                ...row,
                status: "Rescheduled" as const,
                paymentStatus: "Transferred",
              }
            : row,
        ),
      ]);
      setMessage(
        `Appointment rescheduled to ${updated.date} at ${updated.time}. The old slot is available again.`,
      );
    } catch (error: any) {
      setMessage(error?.message || "Could not reschedule the appointment.");
    }
  };

  const completeCounterRefund = async (appointment: Appointment) => {
    const expectedMethod =
      appointment.refundMethod === "CASH" ? "CASH" : "PAYTM_POS";
    if (
      !window.confirm(
        `Confirm that the ₹${appointment.refundAmount || appointment.fee} ${expectedMethod === "CASH" ? "cash" : "Paytm POS"} refund has been given to ${appointment.patientName}?`,
      )
    )
      return;
    const reference =
      expectedMethod === "PAYTM_POS"
        ? window.prompt("Enter the Paytm POS refund reference:")
        : "";
    if (reference === null) return;
    const notes = window.prompt("Optional refund note:", "") ?? "";
    try {
      const updated = await recordAppointmentRefund(
        appointment.id,
        expectedMethod,
        reference.trim(),
        notes.trim(),
      );
      setAppointments((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      setMessage(
        `Refund recorded successfully through ${expectedMethod === "CASH" ? "cash" : "Paytm POS"}.`,
      );
    } catch (error: any) {
      setMessage(error?.message || "Could not record the refund.");
    }
  };

  React.useEffect(() => {
    if (historicalEntry || !booking.doctorId || !booking.date) {
      setSlots([]);
      return;
    }
    let active = true;
    const refresh = () =>
      getDoctorAvailability(booking.doctorId, booking.date)
        .then((rows) => {
          if (active) {
            setSlots(rows);
            setBooking((current) =>
              current.time && !rows.includes(current.time)
                ? { ...current, time: "" }
                : current,
            );
          }
        })
        .catch(() => null);
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [booking.doctorId, booking.date, historicalEntry]);
  React.useEffect(() => {
    const query = patientSearch.trim();
    if (selectedBookingPatient || query.length < 2) {
      setPatientResults([]);
      return;
    }
    const timer = window.setTimeout(
      () =>
        searchExistingPatients(query)
          .then(setPatientResults)
          .catch(() => setPatientResults([])),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [patientSearch, selectedBookingPatient]);
  const selectedBookingDoctor = doctors.find(
    (row) => row.id === booking.doctorId,
  );
  const standardConsultationFee = selectedBookingDoctor?.fee || 0;
  const concessionAmount = booking.followUpOf
    ? 0
    : Math.floor((standardConsultationFee * concessionPercent) / 100);
  const finalConsultationFee = booking.followUpOf
    ? 0
    : standardConsultationFee - concessionAmount;
  const bookingDoctors = doctors.filter(
    (row) => !bookingDepartment || row.department === bookingDepartment,
  );
  const eligibleFollowUp = React.useMemo(() => {
    if (!booking.patientId || !booking.doctorId || !booking.date)
      return undefined;
    const target = new Date(`${booking.date}T00:00:00`);
    return appointments.find((row) => {
      const expiry = new Date(`${row.date}T00:00:00`);
      expiry.setDate(expiry.getDate() + 14);
      const alreadyUsed = appointments.some(
        (candidate) =>
          candidate.followUpOf === row.id &&
          !["Cancelled", "NoShow", "Rescheduled"].includes(candidate.status),
      );
      return (
        row.patientId === booking.patientId &&
        row.doctorId === booking.doctorId &&
        row.status === "Completed" &&
        row.paymentStatus === "Confirmed" &&
        row.fee > 0 &&
        target >= new Date(`${row.date}T00:00:00`) &&
        target <= expiry &&
        !alreadyUsed
      );
    });
  }, [appointments, booking.patientId, booking.doctorId, booking.date]);
  const bookingAvailableDates = React.useMemo(() => {
    if (!selectedBookingDoctor) return [];
    const schedule = doctorSchedule(selectedBookingDoctor);
    const dates: Array<{
      full: string;
      day: string;
      dayNumber: string;
      month: string;
    }> = [];
    const start = new Date();
    for (let offset = 0; offset < 14; offset += 1) {
      const value = new Date(start);
      value.setDate(start.getDate() + offset);
      const day = value.toLocaleDateString("en-US", {
        weekday: "long",
      }) as WeekDayName;
      if ((schedule[day] || []).length) {
        dates.push({
          full: clinicDate(value),
          day: day.slice(0, 3),
          dayNumber: value.toLocaleDateString("en-US", { day: "numeric" }),
          month: value.toLocaleDateString("en-US", { month: "short" }),
        });
      }
    }
    return dates;
  }, [selectedBookingDoctor]);
  const bookConsultation = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setBookingBusy(true);
    if (
      !booking.followUpOf &&
      concessionPercent > 0 &&
      concessionReason.trim().length < 3
    ) {
      setMessage("Enter why the concession is being granted.");
      setBookingBusy(false);
      return;
    }
    if (historicalEntry && historicalReason.trim().length < 3) {
      setMessage("Explain why this past consultation is being entered now.");
      setBookingBusy(false);
      return;
    }
    let appointmentId = "";
    try {
      const created = await createCounterAppointment({
        ...booking,
        concessionPercent,
        concessionReason: concessionReason.trim(),
        recordedAfterService: historicalEntry,
        historicalEntryReason: historicalReason.trim(),
      });
      appointmentId = created.id;
      if (created.isFreeFollowUp) {
        setMessage(
          "Free follow-up appointment booked successfully. No payment is required.",
        );
        setBooking({
          patientId: "",
          doctorId: "",
          date: "",
          time: "",
          followUpOf: "",
        });
        setBookingDepartment("");
        setPatientSearch("");
        setPatientResults([]);
        setSelectedBookingPatient(null);
        setConcessionPercent(0);
        setConcessionReason("");
        await load();
        setBookingBusy(false);
        return;
      }
    } catch (error: any) {
      if (booking.doctorId && booking.date)
        getDoctorAvailability(booking.doctorId, booking.date)
          .then(setSlots)
          .catch(() => null);
      setMessage(error?.message || "Could not book consultation.");
      setBookingBusy(false);
      return;
    }
    try {
      if (bookingPaymentMethod === "CASH") {
        const paidAppointment = await recordCashPayment(appointmentId);
        setConsultationReceipt(paidAppointment);
        setMessage(
          "Appointment booked and cash payment recorded successfully.",
        );
      } else {
        await initiatePaytmPosPayment(appointmentId);
        setMessage(
          "Appointment booked and payment sent to the Paytm POS. Complete it on the machine, then check its status below.",
        );
      }
    } catch (error: any) {
      setMessage(
        `Appointment was booked, but payment could not be completed: ${error?.message || "POS request failed"}. Use the payment actions below; do not book the slot again.`,
      );
    }
    setBooking({
      patientId: "",
      doctorId: "",
      date: "",
      time: "",
      followUpOf: "",
    });
    setBookingDepartment("");
    setPatientSearch("");
    setPatientResults([]);
    setSelectedBookingPatient(null);
    setConcessionPercent(0);
    setConcessionReason("");
    setHistoricalEntry(false);
    setHistoricalReason("");
    await load();
    setBookingBusy(false);
  };

  const submitPatientPasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordTarget) return;
    if (resetPassword !== resetPasswordConfirmation) {
      setMessage("The passwords do not match.");
      return;
    }
    try {
      await resetAccountPassword(passwordTarget.userId, resetPassword);
      setMessage(
        `Password reset for ${passwordTarget.name}. Their patient login is active.`,
      );
      setPasswordTarget(null);
      setResetPassword("");
      setResetPasswordConfirmation("");
    } catch (error: any) {
      setMessage(error?.message || "Could not reset the patient password.");
    }
  };

  const confirmConsulted = async (row: Appointment) => {
    const reason =
      row.status === "NoShow"
        ? window.prompt(
            "This was recorded as a no-show. Enter the correction reason:",
          )
        : "";
    if (reason === null) return;
    try {
      const updated = await markAppointmentConsulted(
        row.id,
        reason || "Counter confirmed consultation",
      );
      setAppointments((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage(
        `${updated.patientName}'s consultation is now marked completed.`,
      );
    } catch (error: any) {
      setMessage(error?.message || "Could not confirm the consultation.");
    }
  };

  return (
    <>
      <div className="no-print mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">Patient Registration</h1>
            <p className="text-gray-500">
              Register clinic patients or free-camp patients. Registration
              itself has no charge.
            </p>
          </div>
          <Link
            href="/dashboard/payroll"
            className="rounded-xl bg-sky-50 px-4 py-3 font-bold text-sky-700"
          >
            My Payroll
          </Link>
        </div>
        <div className="grid gap-8 lg:grid-cols-[430px_1fr]">
          <form
            onSubmit={submit}
            className="space-y-4 rounded-3xl border bg-white p-7"
          >
            <h2 className="flex items-center text-xl font-bold">
              <PlusCircle className="mr-2 text-sky-600" />
              Register patient
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setForm({ ...emptyForm, isFreeCamp: true });
                  setMatches([]);
                }}
                className={`rounded-xl border p-3 font-bold ${form.isFreeCamp ? "bg-sky-600 text-white" : "bg-white"}`}
              >
                Free camp
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm({ ...emptyForm, isFreeCamp: false });
                  setMatches([]);
                }}
                className={`rounded-xl border p-3 font-bold ${!form.isFreeCamp ? "bg-sky-600 text-white" : "bg-white"}`}
              >
                Clinic patient
              </button>
            </div>
            {form.isFreeCamp && (
              <label className="block text-sm font-bold">
                <Required>Camp</Required>
                <select
                  required
                  value={form.campId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      campId: event.target.value,
                      departmentId: "",
                    })
                  }
                  className="mt-1 w-full rounded-xl border p-3"
                >
                  <option value="">Select open camp</option>
                  {camps.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} — {row.date}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm font-bold">
              <Required>Name</Required>
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    name: event.target.value,
                    existingPatientId: "",
                    createSeparatePatient: false,
                  })
                }
                className="mt-1 w-full rounded-xl border p-3"
              />
            </label>
            <label className="block text-sm font-bold">
              <Required>Mobile number</Required>
              <div className="mt-1 flex gap-2">
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  value={form.phoneNo}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      phoneNo: event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 10),
                      existingPatientId: "",
                      createSeparatePatient: false,
                    })
                  }
                  onBlur={lookup}
                  className="min-w-0 flex-1 rounded-xl border p-3"
                />
                <button
                  type="button"
                  onClick={lookup}
                  className="rounded-xl border px-3"
                  aria-label="Check existing patient"
                >
                  <Search />
                </button>
              </div>
            </label>
            {matches.length > 0 && (
              <fieldset className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <legend className="font-bold">
                  Patient exists — confirm identity
                </legend>
                {matches.map((row) => (
                  <label key={row.userId} className="mt-2 flex gap-2">
                    <input
                      required
                      type="radio"
                      name="existingPatient"
                      checked={
                        form.existingPatientId === row.userId &&
                        !form.createSeparatePatient
                      }
                      onChange={() =>
                        setForm({
                          ...form,
                          existingPatientId: row.userId,
                          createSeparatePatient: false,
                          name: row.name,
                          address: row.address,
                          age: row.age == null ? "" : String(row.age),
                          gender: row.gender,
                          nativePlace: row.nativePlace || "",
                          enablePortalLogin: false,
                          portalPassword: "",
                          confirmPortalPassword: "",
                        })
                      }
                    />
                    <span>
                      {row.name} — {row.patientId}
                      {row.exactMatch ? " (exact match)" : ""}
                    </span>
                  </label>
                ))}
                <label className="mt-2 flex gap-2">
                  <input
                    required
                    type="radio"
                    name="existingPatient"
                    checked={form.createSeparatePatient}
                    onChange={() =>
                      setForm({
                        ...form,
                        existingPatientId: "",
                        createSeparatePatient: true,
                      })
                    }
                  />
                  <span>
                    Different patient sharing this mobile number — create a new
                    BHCC ID
                  </span>
                </label>
              </fieldset>
            )}
            <label className="block text-sm font-bold">
              <Required>Address</Required>
              <textarea
                required
                value={form.address}
                onChange={(event) =>
                  setForm({ ...form, address: event.target.value })
                }
                className="mt-1 w-full rounded-xl border p-3"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-bold">
                <Required>Age</Required>
                <input
                  required
                  type="number"
                  min="0"
                  max="120"
                  value={form.age}
                  onChange={(event) =>
                    setForm({ ...form, age: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border p-3"
                />
              </label>
              <label className="text-sm font-bold">
                <Required>Gender</Required>
                <select
                  required
                  value={form.gender}
                  onChange={(event) =>
                    setForm({ ...form, gender: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border p-3"
                >
                  <option value="">Select</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-bold">
              Native place{" "}
              <span className="font-normal text-gray-500">(optional)</span>
              <input
                value={form.nativePlace}
                onChange={(event) =>
                  setForm({ ...form, nativePlace: event.target.value })
                }
                className="mt-1 w-full rounded-xl border p-3"
              />
            </label>
            <div className="rounded-xl border bg-gray-50 p-4">
              <label className="flex items-center gap-2 font-bold">
                <input
                  type="checkbox"
                  checked={form.enablePortalLogin}
                  disabled={Boolean(form.existingPatientId)}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      enablePortalLogin: event.target.checked,
                      portalPassword: "",
                      confirmPortalPassword: "",
                    })
                  }
                />
                Enable patient portal login
              </label>
              <p className="mt-1 text-xs text-gray-500">
                Optional for a newly created patient. Existing patients must use
                the authorized password-reset flow.
              </p>
              {form.enablePortalLogin && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-bold">
                    Temporary password
                    <div className="mt-1 flex items-center rounded-xl border bg-white px-3">
                      <input
                        required
                        minLength={8}
                        type={showPortalPassword ? "text" : "password"}
                        value={form.portalPassword}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            portalPassword: event.target.value,
                          })
                        }
                        className="min-w-0 flex-1 p-3 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPortalPassword((value) => !value)}
                        aria-label={
                          showPortalPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPortalPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>
                  </label>
                  <label className="text-sm font-bold">
                    Confirm password
                    <input
                      required
                      minLength={8}
                      type={showPortalPassword ? "text" : "password"}
                      value={form.confirmPortalPassword}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          confirmPortalPassword: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border bg-white p-3"
                    />
                  </label>
                </div>
              )}
            </div>
            <label className="block text-sm font-bold">
              <Required>Department</Required>
              <select
                required
                value={form.departmentId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    departmentId: event.target.value,
                    doctorId: "",
                    time: "",
                  })
                }
                disabled={form.isFreeCamp && !camp}
                className="mt-1 w-full rounded-xl border p-3 disabled:bg-gray-100"
              >
                <option value="">Select department</option>
                {availableDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            {form.isFreeCamp && (
              <>
                <label className="block text-sm font-bold">
                  <Required>Doctor</Required>
                  <select
                    required
                    value={form.doctorId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        doctorId: event.target.value,
                        time: "",
                      })
                    }
                    className="mt-1 w-full rounded-xl border p-3"
                  >
                    <option value="">Select camp doctor</option>
                    {campDoctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-bold">
                  <Required>Appointment time</Required>
                  <select
                    required
                    value={form.time}
                    onChange={(event) =>
                      setForm({ ...form, time: event.target.value })
                    }
                    className="mt-1 w-full rounded-xl border p-3"
                  >
                    <option value="">Select available slot</option>
                    {campSlots.map((slot) => (
                      <option key={slot}>{slot}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {message && (
              <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
                {message}
              </p>
            )}
            <button
              disabled={saving || !form.departmentId}
              className="w-full rounded-xl bg-sky-600 py-4 font-bold text-white disabled:opacity-60"
            >
              {saving ? "Registering..." : "Register patient"}
            </button>
          </form>
          <div className="overflow-hidden rounded-3xl border bg-white">
            <div className="flex items-center gap-3 border-b p-6">
              <Users className="text-sky-600" />
              <div>
                <h2 className="font-bold">Today’s registrations</h2>
                <p className="text-xs text-gray-500">
                  This operational list starts empty each day. Historical
                  records remain stored.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-4">Patient</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Department</th>
                    <th className="p-4">Token</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {todayRegistrations.map((row) => (
                    <React.Fragment key={row.id}>
                      <tr className="border-t">
                        <td className="p-4 font-bold">
                          {row.name}
                          <small className="block font-normal">
                            {row.phoneNo} · Age {row.age} · {row.gender}
                          </small>
                          <small className="block font-normal">
                            {row.patientId}
                          </small>
                        </td>
                        <td className="p-4">
                          {row.isFreeCamp ? "Free camp" : "Clinic patient"}
                        </td>
                        <td className="p-4">{row.departmentName}</td>
                        <td className="p-4 font-bold text-sky-700">
                          {row.tokenNumber}
                        </td>
                        <td className="p-4">
                          <div className="flex gap-3">
                            <button
                              onClick={() => setEditingId(row.id)}
                              className="font-bold text-sky-700"
                            >
                              Edit
                            </button>
                            {row.isFreeCamp && (
                              <button
                                onClick={() => setReceipt(row)}
                                className="font-bold text-sky-700"
                              >
                                Receipt
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {editingId === row.id && (
                        <tr>
                          <td colSpan={5} className="p-3">
                            <RegistrationEditor
                              registration={row}
                              departments={
                                row.isFreeCamp
                                  ? camps.find((item) => item.id === row.campId)
                                      ?.departments || departments
                                  : departments
                              }
                              onCancel={() => setEditingId(null)}
                              onSaved={(updated) => {
                                setRegistrations((current) =>
                                  current.map((item) =>
                                    item.id === updated.id ? updated : item,
                                  ),
                                );
                                setEditingId(null);
                                setMessage(
                                  "Patient details updated successfully.",
                                );
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {todayRegistrations.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500">
                        No patients registered today.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {receipt && (
          <div className="mt-6 rounded-3xl border bg-white p-6">
            <h2 className="text-xl font-bold">Receipt ready</h2>
            <p>
              {receipt.name} · {receipt.departmentName}
            </p>
            <button
              onClick={printReceipt}
              className="mt-4 flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white"
            >
              <Printer />
              Print 3-inch receipt
            </button>
          </div>
        )}
        {consultationReceipt && (
          <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="text-xl font-bold text-emerald-900">
              Consultation receipt ready
            </h2>
            <p className="mt-1 text-sm text-emerald-800">
              {consultationReceipt.patientName} ·{" "}
              {consultationReceipt.doctorName} · ₹
              {consultationReceipt.fee.toLocaleString("en-IN")}
            </p>
            <button
              type="button"
              onClick={() => printConsultationReceipt(consultationReceipt)}
              className="mt-4 flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white"
            >
              <Printer />
              Print consultation receipt
            </button>
          </div>
        )}
        <section className="mt-8 overflow-hidden rounded-3xl border bg-white">
          <form
            onSubmit={bookConsultation}
            className="border-b bg-slate-50 p-6"
          >
            <div className="mb-6">
              <h2 className="text-2xl font-black">Book doctor at counter</h2>
              <p className="text-sm text-gray-500">
                Follow the same booking sequence as the patient portal, then
                collect Cash or Online / Paytm POS payment.
              </p>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border bg-white p-5">
                <p className="mb-3 text-xs font-black uppercase tracking-wider text-sky-700">
                  1 · Department and doctor
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-bold">
                    Department
                    <select
                      required
                      value={bookingDepartment}
                      onChange={(e) => {
                        setBookingDepartment(e.target.value);
                        setBooking({
                          ...booking,
                          doctorId: "",
                          date: "",
                          time: "",
                          followUpOf: "",
                        });
                      }}
                      className="mt-1 w-full rounded-xl border p-3"
                    >
                      <option value="">Select department</option>
                      {departments.map((row) => (
                        <option key={row.id} value={row.name}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-bold">
                    Doctor
                    <select
                      required
                      value={booking.doctorId}
                      onChange={(e) =>
                        setBooking({
                          ...booking,
                          doctorId: e.target.value,
                          date: "",
                          time: "",
                          followUpOf: "",
                        })
                      }
                      disabled={!bookingDepartment}
                      className="mt-1 w-full rounded-xl border p-3 disabled:bg-gray-100"
                    >
                      <option value="">Select doctor</option>
                      {bookingDoctors.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {selectedBookingDoctor && (
                  <p className="mt-3 rounded-xl bg-sky-50 p-3 text-sm">
                    <b>{selectedBookingDoctor.name}</b>
                    <span className="block text-gray-600">
                      {selectedBookingDoctor.specialty ||
                        selectedBookingDoctor.department}{" "}
                      · Consultation ₹
                      {(selectedBookingDoctor.fee || 0).toLocaleString("en-IN")}
                    </span>
                  </p>
                )}
              </section>
              <section className="rounded-2xl border bg-white p-5 lg:col-span-2">
                <p className="mb-4 text-xs font-black uppercase tracking-wider text-sky-700">
                  2 · Date and live slot
                </p>
                <label className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                  <input type="checkbox" className="mt-1" checked={historicalEntry} onChange={(event) => { setHistoricalEntry(event.target.checked); setBooking({ ...booking, date: "", time: "", followUpOf: "" }); setHistoricalReason(""); }} />
                  <span><b>Record a missed past consultation</b><small className="block text-amber-900">Use only when the patient was actually consulted but the appointment was not entered online.</small></span>
                </label>
                {historicalEntry ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-bold">Consultation date<input required type="date" max={today} value={booking.date} onChange={(event) => setBooking({ ...booking, date: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
                    <label className="text-sm font-bold">Consultation time<input required type="time" value={booking.time} onChange={(event) => setBooking({ ...booking, time: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
                    <label className="text-sm font-bold sm:col-span-2">Reason for late entry <span className="text-red-600">*</span><textarea required value={historicalReason} onChange={(event) => setHistoricalReason(event.target.value)} placeholder="For example: consultation was completed yesterday but missed during registration" className="mt-1 w-full rounded-xl border p-3" /></label>
                  </div>
                ) : !selectedBookingDoctor ? (
                  <p className="rounded-xl bg-gray-50 p-5 text-sm text-gray-500">
                    Select a department and doctor first.
                  </p>
                ) : bookingAvailableDates.length === 0 ? (
                  <p className="rounded-xl bg-amber-50 p-5 text-sm font-semibold text-amber-800">
                    This doctor has no consultation schedule configured for the
                    next 14 days. Ask the administrator to configure
                    availability.
                  </p>
                ) : (
                  <>
                    <h3 className="mb-3 flex items-center text-sm font-bold">
                      <Calendar size={17} className="mr-2 text-sky-600" />
                      Select available date
                    </h3>
                    <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
                      {bookingAvailableDates.map((date) => (
                        <button
                          type="button"
                          key={date.full}
                          onClick={() =>
                            setBooking({
                              ...booking,
                              date: date.full,
                              time: "",
                              followUpOf: "",
                            })
                          }
                          className={`flex min-w-[92px] flex-col items-center rounded-2xl border-2 p-3 transition ${booking.date === date.full ? "border-sky-600 bg-sky-600 text-white shadow-lg" : "border-gray-100 bg-white text-gray-600 hover:border-sky-200"}`}
                        >
                          <span className="text-[10px] font-black uppercase tracking-widest">
                            {date.day}
                          </span>
                          <span className="text-xl font-black">
                            {date.dayNumber}
                          </span>
                          <span className="text-[10px] font-bold">
                            {date.month}
                          </span>
                        </button>
                      ))}
                    </div>
                    {booking.date && (
                      <>
                        <h3 className="mb-3 flex items-center text-sm font-bold">
                          <Clock size={17} className="mr-2 text-sky-600" />
                          Choose time slot
                        </h3>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7">
                          {slots.map((slot) => (
                            <button
                              type="button"
                              key={slot}
                              onClick={() =>
                                setBooking({ ...booking, time: slot })
                              }
                              className={`rounded-xl py-3 text-sm font-bold transition ${booking.time === slot ? "bg-sky-600 text-white shadow-lg" : "bg-sky-50 text-sky-700 hover:bg-sky-100"}`}
                            >
                              {slot}
                            </button>
                          ))}
                          {slots.length === 0 && (
                            <p className="col-span-full rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                              No slots remain for this date. Select another
                              available date.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
                <p className="mt-4 text-xs text-gray-500">{historicalEntry ? "The entry will be marked completed and retained with the counter account, timestamp and reason." : "Availability refreshes automatically. Booked slots disappear and cancelled slots reopen."}</p>
              </section>
              <section className="rounded-2xl border bg-white p-5">
                <p className="mb-3 text-xs font-black uppercase tracking-wider text-sky-700">
                  3 · Existing patient
                </p>
                <div className="relative">
                  <div className="flex items-center rounded-xl border bg-white px-3">
                    <Search size={18} className="text-gray-400" />
                    <input
                      required
                      value={patientSearch}
                      onChange={(e) => {
                        setPatientSearch(e.target.value);
                        setSelectedBookingPatient(null);
                        setBooking({
                          ...booking,
                          patientId: "",
                          followUpOf: "",
                        });
                      }}
                      placeholder="Search name, mobile or BHCC ID"
                      className="w-full p-3 outline-none"
                    />
                  </div>
                  {patientResults.length > 0 && !booking.patientId && (
                    <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border bg-white shadow-xl">
                      {patientResults.map((row) => (
                        <button
                          type="button"
                          key={row.userId}
                          onClick={() => {
                            setSelectedBookingPatient(row);
                            setBooking({
                              ...booking,
                              patientId: row.userId,
                              followUpOf: "",
                            });
                            setPatientSearch(`${row.name} — ${row.patientId}`);
                            setPatientResults([]);
                          }}
                          className="block w-full border-b p-3 text-left hover:bg-sky-50"
                        >
                          <b>{row.name}</b>
                          <small className="block text-gray-500">
                            {row.patientId} · {row.phoneNo}
                          </small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedBookingPatient && booking.patientId ? (
                  <div className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-900">
                    <div className="flex flex-wrap items-center justify-between gap-2"><b>Selected: {selectedBookingPatient.name}</b><button type="button" onClick={() => setPasswordTarget(selectedBookingPatient)} className="rounded-lg border border-sky-600 bg-white px-3 py-1 font-bold text-sky-700">Reset patient password</button></div>
                    <span className="mt-1 block">
                      Patient ID: {selectedBookingPatient.patientId}
                    </span>
                    <span className="block">
                      Mobile: {selectedBookingPatient.phoneNo}
                    </span>
                    {selectedBookingPatient.age != null && (
                      <span className="block">
                        Age: {selectedBookingPatient.age}
                        {selectedBookingPatient.gender
                          ? ` · ${selectedBookingPatient.gender}`
                          : ""}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">
                    Select a result before continuing.
                  </p>
                )}
              </section>
              <section className="rounded-2xl border bg-white p-5">
                <p className="mb-3 text-xs font-black uppercase tracking-wider text-sky-700">
                  4 · Review and payment
                </p>
                {eligibleFollowUp && (
                  <button
                    type="button"
                    onClick={() =>
                      setBooking({
                        ...booking,
                        followUpOf: booking.followUpOf
                          ? ""
                          : eligibleFollowUp.id,
                      })
                    }
                    className={`mb-4 w-full rounded-xl border p-3 text-left ${booking.followUpOf ? "border-green-600 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}
                  >
                    <b>
                      {booking.followUpOf
                        ? "✓ Free follow-up applied"
                        : "Free follow-up available"}
                    </b>
                    <small className="block">
                      One follow-up with this doctor is free through{" "}
                      {new Date(
                        `${eligibleFollowUp.date}T00:00:00`,
                      ).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      + 14 days. Click to{" "}
                      {booking.followUpOf ? "remove" : "apply"}.
                    </small>
                  </button>
                )}
                {!booking.followUpOf && (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <label className="text-sm font-bold">
                      Concession percentage (maximum 100%)
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={concessionPercent}
                        onChange={(event) =>
                          setConcessionPercent(
                            Math.max(
                              0,
                              Math.min(100, Number(event.target.value) || 0),
                            ),
                          )
                        }
                        className="mt-1 w-full rounded-lg border bg-white p-2"
                      />
                    </label>
                    {concessionPercent > 0 && (
                      <label className="mt-3 block text-sm font-bold">
                        Reason for concession{" "}
                        <span className="text-red-600">*</span>
                        <textarea
                          required
                          value={concessionReason}
                          onChange={(event) =>
                            setConcessionReason(event.target.value)
                          }
                          className="mt-1 w-full rounded-lg border bg-white p-2"
                          placeholder="Explain why this concession was approved"
                        />
                      </label>
                    )}
                    <p className="mt-2 text-xs text-amber-900">
                      Every concession is stored with the counter account and
                      timestamp.
                    </p>
                  </div>
                )}
                <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-sm">
                  <span className="text-gray-500">Patient</span>
                  <b className="text-right">
                    {selectedBookingPatient?.name || "—"}
                  </b>
                  <span className="text-gray-500">Doctor</span>
                  <b className="text-right">
                    {selectedBookingDoctor?.name || "—"}
                  </b>
                  <span className="text-gray-500">Date / time</span>
                  <b className="text-right">
                    {booking.date && booking.time
                      ? `${booking.date} · ${booking.time}`
                      : "—"}
                  </b>
                  <span className="text-gray-500">Standard fee</span>
                  <b className="text-right">
                    ₹{standardConsultationFee.toLocaleString("en-IN")}
                  </b>
                  {concessionPercent > 0 && !booking.followUpOf && (
                    <>
                      <span className="text-gray-500">
                        Concession ({concessionPercent}%)
                      </span>
                      <b className="text-right text-amber-700">
                        −₹{concessionAmount.toLocaleString("en-IN")}
                      </b>
                    </>
                  )}
                  <span className="text-gray-500">Amount payable</span>
                  <b className="text-right">
                    {booking.followUpOf
                      ? "Free follow-up"
                      : `₹${finalConsultationFee.toLocaleString("en-IN")}`}
                  </b>
                </div>
                {!booking.followUpOf && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setBookingPaymentMethod("CASH")}
                      className={`rounded-xl border p-3 font-bold ${bookingPaymentMethod === "CASH" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "bg-white"}`}
                    >
                      Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookingPaymentMethod("PAYTM_POS")}
                      className={`rounded-xl border p-3 font-bold ${bookingPaymentMethod === "PAYTM_POS" ? "border-sky-600 bg-sky-50 text-sky-800" : "bg-white"}`}
                    >
                      Paytm POS
                    </button>
                  </div>
                )}
              </section>
            </div>
            <button
              disabled={
                bookingBusy ||
                !bookingDepartment ||
                !booking.doctorId ||
                !booking.date ||
                !booking.time ||
                !booking.patientId
              }
              className="mt-5 w-full rounded-xl bg-slate-900 p-4 text-lg font-black text-white disabled:opacity-50"
            >
              {bookingBusy
                ? "Booking and processing…"
                : booking.followUpOf
                  ? "Confirm free follow-up"
                  : `Confirm booking and ${bookingPaymentMethod === "CASH" ? "record cash" : "send to Paytm POS"}`}
            </button>
          </form>
          <div className="border-b p-6">
            <h2 className="text-xl font-bold">Today’s consultation payments</h2>
            <p className="text-sm text-gray-500">
              Daily department tokens reset from 001. Only today’s appointments
              appear here; historical payments remain stored.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4">Token</th>
                  <th className="p-4">Appointment</th>
                  <th className="p-4">Doctor</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Payment</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {todayAppointments.slice(0, 100).map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t ${row.status === "Cancelled" ? "bg-red-50/50" : ""}`}
                  >
                    <td className="p-4 font-black text-sky-700">
                      {row.tokenNumber || "—"}
                    </td>
                    <td className="p-4">
                      <b>{row.patientName}</b>
                      <small className="block">
                        {row.date} · {row.time}
                      </small>
                      <small className="block font-bold">{row.status}</small>
                      {row.cancellationReason && (
                        <small className="block text-red-700">
                          {row.cancellationReason}
                        </small>
                      )}
                    </td>
                    <td className="p-4">
                      {row.doctorName}
                      <small className="block">{row.department}</small>
                    </td>
                    <td className="p-4 font-bold">
                      ₹{row.fee.toLocaleString("en-IN")}
                    </td>
                    <td className="p-4">
                      {row.paymentStatus || "Pending"}
                      {row.paymentMethod && (
                        <small className="block font-bold">
                          {row.paymentMethod === "CASH"
                            ? "Cash"
                            : row.paymentMethod === "FREE_FOLLOW_UP"
                              ? "Free Follow-up"
                              : "Online / Paytm"}
                        </small>
                      )}
                      {row.paymentReference && (
                        <small className="block font-mono">
                          {row.paymentReference}
                        </small>
                      )}
                      {row.refundStatus && (
                        <small className="block font-bold text-red-700">
                          Refund: {row.refundStatus}
                          {row.refundMethod ? ` · ${row.refundMethod}` : ""}
                        </small>
                      )}
                      {row.refundReference && (
                        <small className="block font-mono">
                          {row.refundReference}
                        </small>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {row.status === "Cancelled" ? (
                          <>
                            {row.refundStatus === "Pending" &&
                              ["CASH", "PAYTM_POS"].includes(
                                row.refundMethod || "",
                              ) && (
                                <button
                                  type="button"
                                  onClick={() => completeCounterRefund(row)}
                                  className="rounded-lg bg-red-600 px-3 py-2 font-bold text-white"
                                >
                                  Record refund
                                </button>
                              )}
                          </>
                        ) : (
                          <>
                            {row.paymentStatus === "Confirmed" ||
                            row.paymentStatus === "Free Follow-up" ? (
                              <>
                                <span className="self-center font-bold text-green-700">
                                  {row.paymentStatus === "Confirmed"
                                    ? "Payment recorded"
                                    : "No payment required"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => printConsultationReceipt(row)}
                                  className="flex items-center gap-1 rounded-lg border px-3 py-2 font-bold"
                                >
                                  <Printer size={16} />
                                  Print receipt
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => recordCash(row)}
                                  className="rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white"
                                >
                                  Cash
                                </button>
                                {row.paymentMethod === "PAYTM_POS_AUTOMATIC" ? (
                                  <button
                                    type="button"
                                    onClick={() => runAutomaticPos(row, true)}
                                    className="rounded-lg bg-amber-600 px-3 py-2 font-bold text-white"
                                  >
                                    Check Paytm
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => runAutomaticPos(row)}
                                    className="rounded-lg bg-sky-600 px-3 py-2 font-bold text-white"
                                  >
                                    Paytm POS
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => recordPosPayment(row)}
                                  className="rounded-lg border px-3 py-2 font-bold"
                                >
                                  Enter Paytm receipt
                                </button>
                              </>
                            )}
                            {["Upcoming", "CheckedIn"].includes(row.status) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    rescheduleCounterAppointment(row)
                                  }
                                  className="rounded-lg border border-amber-500 px-3 py-2 font-bold text-amber-800"
                                >
                                  Reschedule
                                </button>
                                <button
                                  type="button"
                                  onClick={() => cancelCounterAppointment(row)}
                                  className="rounded-lg border border-red-500 px-3 py-2 font-bold text-red-700"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {todayAppointments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      No appointments or payments for today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        {reconciliationAppointments.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-3xl border border-amber-200 bg-white">
            <div className="border-b border-amber-200 bg-amber-50 p-6"><h2 className="text-xl font-bold text-amber-950">Paid appointments needing consultation confirmation</h2><p className="text-sm text-amber-900">These payments are recorded, but the appointment was not marked completed. Confirm only after verifying that the doctor actually consulted the patient.</p></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-4">Patient</th><th className="p-4">Doctor</th><th className="p-4">Date / time</th><th className="p-4">Status</th><th className="p-4">Action</th></tr></thead><tbody>{reconciliationAppointments.map((row) => <tr key={row.id} className="border-t"><td className="p-4 font-bold">{row.patientName}<small className="block font-normal">{row.patientId}</small></td><td className="p-4">{row.doctorName}</td><td className="p-4">{row.date} · {row.time}</td><td className="p-4 font-bold text-amber-800">{row.status}</td><td className="p-4"><button type="button" onClick={() => confirmConsulted(row)} className="rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white">Mark consulted</button></td></tr>)}</tbody></table></div>
          </section>
        )}
        {passwordTarget && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={submitPatientPasswordReset} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"><h2 className="text-xl font-black">Reset patient password</h2><p className="mt-2 text-sm text-gray-500">Set a temporary password for {passwordTarget.name}. The action is audited and their account will be activated.</p><div className="mt-5 space-y-4"><PasswordInput required minLength={8} autoComplete="new-password" placeholder="New temporary password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} className="rounded-xl border px-4 py-3"/><PasswordInput required minLength={8} autoComplete="new-password" placeholder="Confirm temporary password" value={resetPasswordConfirmation} onChange={(event) => setResetPasswordConfirmation(event.target.value)} className="rounded-xl border px-4 py-3"/></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => { setPasswordTarget(null); setResetPassword(""); setResetPasswordConfirmation(""); }} className="rounded-xl px-4 py-2 font-bold text-gray-600">Cancel</button><button type="submit" className="rounded-xl bg-sky-600 px-4 py-2 font-bold text-white">Reset password</button></div></form></div>
        )}
      </div>
    </>
  );
};

export default CounterDashboard;
