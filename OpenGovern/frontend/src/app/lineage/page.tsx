export default function Lineage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-light text-gray-900">Data Lineage</h1>
          <p className="mt-2 text-lg text-gray-600">Explore data flow and dependencies</p>
        </div>
        <div className="flex space-x-3">
          <button className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
            Column Level
          </button>
          <button className="rounded-lg bg-black px-6 py-2 text-white hover:bg-gray-800 transition-colors">
            Impact Analysis
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-white p-8 shadow-sm border border-gray-100">
        <div className="text-center py-16">
          <div className="mx-auto h-16 w-16 text-gray-400 mb-4">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h3 className="text-xl font-medium text-gray-900 mb-2">Interactive Lineage Graph</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Visualize upstream and downstream dependencies with column-level lineage. Powered by OpenMetadata's lineage engine.
          </p>
          <div className="flex justify-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Tables</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Pipelines</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Dashboards</span>
            </div>
          </div>
        </div>

        {/* Mock lineage visualization */}
        <div className="mt-8 bg-gray-50 rounded-lg p-6">
          <div className="flex items-center justify-center space-x-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center mb-2 mx-auto">
                <span className="text-blue-600 font-medium">DB</span>
              </div>
              <p className="text-sm font-medium">Raw Data</p>
              <p className="text-xs text-gray-500">PostgreSQL</p>
            </div>
            <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-lg flex items-center justify-center mb-2 mx-auto">
                <span className="text-green-600 font-medium">ETL</span>
              </div>
              <p className="text-sm font-medium">Transform</p>
              <p className="text-xs text-gray-500">Airflow</p>
            </div>
            <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-lg flex items-center justify-center mb-2 mx-auto">
                <span className="text-purple-600 font-medium">BI</span>
              </div>
              <p className="text-sm font-medium">Dashboard</p>
              <p className="text-xs text-gray-500">Tableau</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}