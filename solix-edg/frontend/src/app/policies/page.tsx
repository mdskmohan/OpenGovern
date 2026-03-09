export default function Policies() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-light text-gray-900">Policies</h1>
          <p className="mt-2 text-lg text-gray-600">Manage governance policies and rules</p>
        </div>
        <button className="rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800 transition-colors">
          Create Policy
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <span className="text-blue-600 font-semibold">PII</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">PII Data Protection</h3>
              <p className="text-sm text-gray-500">Rego policy for PII handling</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Ensures all PII data is properly classified and access is restricted.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Active</span>
            <button className="text-sm text-blue-600 hover:text-blue-800">Edit</button>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <span className="text-red-600 font-semibold">SEC</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Data Retention</h3>
              <p className="text-sm text-gray-500">Compliance policy</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Enforces data retention policies for regulatory compliance.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Active</span>
            <button className="text-sm text-blue-600 hover:text-blue-800">Edit</button>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <span className="text-purple-600 font-semibold">ACC</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Access Control</h3>
              <p className="text-sm text-gray-500">RBAC policy</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Controls access to sensitive data based on user roles.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Draft</span>
            <button className="text-sm text-blue-600 hover:text-blue-800">Edit</button>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-gray-50 p-8 text-center">
        <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Policy Engine Integration</h3>
        <p className="text-gray-600 max-w-md mx-auto">
          Policies are powered by Open Policy Agent with Rego. Full integration with OpenMetadata for automated governance.
        </p>
      </div>
    </div>
  );
}