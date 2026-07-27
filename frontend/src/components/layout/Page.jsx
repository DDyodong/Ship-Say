import React from "react";
import DigitalTwin from "../../pages/admin/DigitalTwin";
import Monitoring from "../../pages/admin/Monitoring";
import WorkerReports from "../../pages/admin/WorkerReports";
import Permits from "../../pages/admin/Permits";
import Risk from "../../pages/admin/Risk";
import Audit from "../../pages/admin/Audit";

function Page({page,session,notify}) {
  return page==="monitoring"?<Monitoring notify={notify}/>:page==="reports"?<WorkerReports session={session} notify={notify}/>:page==="permits"?<Permits session={session} notify={notify}/>:page==="risk"?<Risk/>:page==="audit"?<Audit/>:<DigitalTwin session={session} notify={notify}/>;
}

export default Page;
