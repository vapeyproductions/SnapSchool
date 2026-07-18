"use client";

import { createContext, useContext } from "react";

import type { AssignmentSchedules } from "@/lib/assignment-schedule";

const AssignmentScheduleContext = createContext<AssignmentSchedules>({});

export const AssignmentScheduleProvider = AssignmentScheduleContext.Provider;

export const useAssignmentSchedules = () =>
  useContext(AssignmentScheduleContext);
