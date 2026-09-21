# Final dev acceptance

Use the launch-candidate Preview connected to Tokyo. Sign in with the existing dev admin `prishi.ai.ventures@gmail.com`. Production launch is on hold until the owner accepts this test. Do not enter real production transactions here.

- [ ] Sign in using six-digit email OTP; sign out and confirm return to login.
- [ ] Verify all four blocks and 224 flats. Create a test festival and configure days, charges and fixed/package meal coverage before enrollment.
- [ ] Add cash/online holders and a supplier/reimbursement payee. Invite a test committee member and assign the festival.
- [ ] Record a fixed contribution with named adults, children and under-sevens. Confirm pending payment does not allow attendance. Confirm full payment as admin and check eligibility for a covered meal.
- [ ] Record a meal-package receipt selecting only enrolled residents. Confirm payment, then check the package meal roster. Try a free under-seven-only selection.
- [ ] Open Attendance, choose day/meal, find a flat and save admitted headcount. Refresh and verify it persists; exceeding eligibility should fail.
- [ ] Register guests, open/share the generated pass and check in guests against that meal. Check remaining allowance; test cancellation before admission and closed registration.
- [ ] Enter a catering run and quantities. Confirm its bill and supplier payment, allocate the payment and verify the balance. Expected and admitted quantities should match attendance.
- [ ] Create a Mahila Aarati or Veshbusha event, add participants, check attendance and export the roster.
- [ ] Try category dropdowns and Other with required free text. Verify the admin report, holder balances and exports.
- [ ] As committee member, edit an own pending entry; verify another member's entries and confirmed entries cannot be edited. Verify overview/quantities are available but admin details are restricted.
- [ ] Promote/demote the test member as admin. Confirm the last admin cannot be removed.

Current constraints: the first fixed attendee list is immutable; additional people register as guests. Check-in uses admitted headcounts. Guest fees and receivables are entered manually; automatic billing is deferred. Catering financial controls are admin-only.

Record issues with the page, flat/meal/event, steps and expected result. After approval, deploy a fresh production build against Mumbai and verify `sb@prishi.in` sign-in. Development transactions are not copied.
