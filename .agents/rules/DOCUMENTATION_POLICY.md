# Automatic Documentation Rule

## Policy
For every task, feature addition, schema modification, endpoint update, or architectural change made to the **AetherSFU** codebase, you MUST automatically update the corresponding documentation files in `docs/`:

1. **New API Endpoints or Signal Messages**: Update [`docs/API_REFERENCE.md`](file:///d:/video%20conferencing%20tool/docs/API_REFERENCE.md).
2. **Schema Changes, ID Formats, or Data Models**: Update [`docs/DATA_MODEL.md`](file:///d:/video%20conferencing%20tool/docs/DATA_MODEL.md).
3. **Architectural Decisions, SFU Flow, or Core Logic**: Update [`docs/PROJECT_OVERVIEW.md`](file:///d:/video%20conferencing%20tool/docs/PROJECT_OVERVIEW.md).
4. **Configuration, Environment Variables, or Build Commands**: Update [`docs/DEPLOYMENT_GUIDE.md`](file:///d:/video%20conferencing%20tool/docs/DEPLOYMENT_GUIDE.md).
5. **New Guides or High-Level Flow Docs**: Update the master index in [`docs/README.md`](file:///d:/video%20conferencing%20tool/docs/README.md).

Never finish a feature or code edit without ensuring the documentation in `docs/` accurately reflects the exact state of the implementation.
