export default function Users() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-light text-gray-900">Users & Roles</h1>
        <p className="mt-2 text-lg text-gray-600">Manage users, roles, and permissions</p>
      </div>
      <div className="rounded-xl bg-white p-8 shadow-sm border border-gray-100 text-center">
        <div className="mx-auto h-16 w-16 text-gray-400 mb-4">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-gray-900 mb-2">User Management</h3>
        <p className="text-gray-600">RBAC integrated with Open Policy Agent policies</p>
      </div>
    </div>
  );
}