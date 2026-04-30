export type TechnicianProfile = {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  grade: string;
  regionId: string | null;
  regionName: string | null;
  specialization: string;
  experienceYears: number;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
