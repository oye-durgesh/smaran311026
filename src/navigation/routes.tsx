import { Navigate, Route, Routes } from 'react-router-dom';
import PhoneLayout from '../layouts/PhoneLayout';
import { useStore } from '../data/store';
import { Account, Language, PermMicrophone, PermNotifications, Personalize, Profile, Welcome } from '../screens/Onboarding';
import { AddManual, EditMedicine, Finalize, MedicineDetail, MedicineSetup, MedicinesList, Processing, Review, RxFailed, RxPartial, ScheduleEditor, SetupDone, UploadRx } from '../screens/Medicines';
import Home from '../screens/Home';
import { MedicineHistory, Today } from '../screens/Today';
import { HealthHistory, ReadingSaved, RecordReading } from '../screens/Health';
import Call from '../screens/Call';
import { Family, HelpingParent, Invite, ParentConfirm, RemoteSetup } from '../screens/Family';
import { Appointments, Help, Privacy, Settings } from '../screens/Misc';

function Entry() {
  const { state } = useStore();
  return <Navigate to={state.onboarding.done ? '/home' : '/welcome'} replace />;
}

/**
 * Route map. Screen numbers refer to project/Smaran Complete.dc.html.
 * 01 welcome · 02-05 account/language/personalize/profile · 06-07 permissions · 08-12 prescription flow
 * 13/14/16/48 home variants · 15 medicines · 17-19, 34-37 call states · 23/27 health · 24-26 family/appts/settings
 * 29-33 medicine detail/edit/add · 38-40 reading entry · 41-44 family/privacy · 45/28 errors · 46 today · 47 help · HP1 helper
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PhoneLayout />}>
        <Route index element={<Entry />} />
        <Route path="welcome" element={<Welcome />} />
        <Route path="account" element={<Account />} />
        <Route path="language" element={<Language />} />
        <Route path="personalize" element={<Personalize />} />
        <Route path="profile" element={<Profile />} />
        <Route path="permissions/notifications" element={<PermNotifications />} />
        <Route path="permissions/microphone" element={<PermMicrophone />} />

        <Route path="home" element={<Home />} />
        <Route path="today" element={<Today />} />
        <Route path="history" element={<MedicineHistory />} />

        <Route path="medicines" element={<MedicinesList />} />
        <Route path="medicines/setup" element={<MedicineSetup />} />
        <Route path="medicines/upload" element={<UploadRx />} />
        <Route path="medicines/processing" element={<Processing />} />
        <Route path="medicines/review" element={<Review />} />
        <Route path="medicines/finalize" element={<Finalize />} />
        <Route path="medicines/done" element={<SetupDone />} />
        <Route path="medicines/new" element={<AddManual />} />
        <Route path="medicines/schedule/:id" element={<ScheduleEditor />} />
        <Route path="medicines/:id" element={<MedicineDetail />} />
        <Route path="medicines/:id/edit" element={<EditMedicine />} />

        <Route path="call/:stage" element={<Call />} />

        <Route path="health" element={<HealthHistory />} />
        <Route path="health/record" element={<RecordReading />} />
        <Route path="health/saved" element={<ReadingSaved />} />

        <Route path="family" element={<Family />} />
        <Route path="family/invite" element={<Invite />} />
        <Route path="parent/:pid" element={<HelpingParent />} />
        <Route path="parent/:pid/remote" element={<RemoteSetup />} />
        <Route path="parent/:pid/confirm" element={<ParentConfirm />} />

        <Route path="appointments" element={<Appointments />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/privacy" element={<Privacy />} />
        <Route path="help" element={<Help />} />

        <Route path="errors" element={<RxFailed />} />
        <Route path="errors/partial" element={<RxPartial />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
