export type PostcardBackend = {
  list(request: Request): Promise<Response>;
  create(request: Request): Promise<Response>;
  getById(request: Request, postcardId: string): Promise<Response>;
  updateById(request: Request, postcardId: string): Promise<Response>;
  deleteById(request: Request, postcardId: string): Promise<Response>;
  submitFeedbackById(request: Request, postcardId: string): Promise<Response>;
};

export type ReportBackend = {
  list(request: Request): Promise<Response>;
  cancelById(request: Request, reportId: string): Promise<Response>;
};

export type AdminBackend = {
  listUsers(request: Request): Promise<Response>;
  updateUser(request: Request): Promise<Response>;
  listPostcards(request: Request): Promise<Response>;
  listFeedback(request: Request): Promise<Response>;
  listReports(request: Request): Promise<Response>;
  updateReport(request: Request): Promise<Response>;
  getReportCase(request: Request, caseId: string): Promise<Response>;
  updateReportCase(request: Request, caseId: string): Promise<Response>;
};

export type ProfileBackend = {
  get(request: Request): Promise<Response>;
  update(request: Request): Promise<Response>;
};

export type FeedbackBackend = {
  create(request: Request): Promise<Response>;
};

export type UploadBackend = {
  create(request: Request): Promise<Response>;
};

export type DetectionBackend = {
  list(request: Request): Promise<Response>;
  create(request: Request): Promise<Response>;
};

export type AppBackend = {
  postcards: PostcardBackend;
  reports: ReportBackend;
  admin: AdminBackend;
  profile: ProfileBackend;
  feedback: FeedbackBackend;
  upload: UploadBackend;
  detection: DetectionBackend;
};
