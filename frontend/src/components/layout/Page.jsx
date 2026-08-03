import React from "react";
import DigitalTwin from "../../pages/admin/DigitalTwin";
import Monitoring from "../../pages/admin/Monitoring";
import PpeChecks from "../../pages/admin/PpeChecks";
import WorkerReports from "../../pages/admin/WorkerReports";
import Permits from "../../pages/admin/Permits";
import Risk from "../../pages/admin/Risk";
import Audit from "../../pages/admin/Audit";

function Page({ page, session, notify }) {
  if (page === "monitoring") return <Monitoring notify={notify}/>;
  if (page === "ppe-checks") return <PpeChecks session={session} notify={notify}/>;
  if (page === "reports") return <WorkerReports session={session} notify={notify}/>;
  if (page === "permits") return <Permits session={session} notify={notify}/>;
  if (page === "risk") return <Risk/>;
  if (page === "audit") return <Audit/>;
  return <DigitalTwin session={session} notify={notify}/>;
}

export default Page;
