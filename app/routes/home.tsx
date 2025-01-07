import { useEffect, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export function meta() {
  return [
    { title: "KNN File Viewer" },
    {
      name: "description",
      content: "View and compare similar files",
    },
  ];
}

type FileData = {
  [path: string]: string;
};

let DATA: FileData = {
  "src/main.rs": `fn main() {
    println!("Hello World!");
    let x = 42;
    println!("The answer is {}", x);
}`,
  "examples/hello.rs": `fn main() {
    println!("Hello from example!");
    let message = "Welcome";
    println!("{}", message);
}`,
  "tests/basic.rs": `#[test]
fn test_main() {
    assert_eq!(2 + 2, 4);
}`,
};

// Scripts can regex for this and replace with 
// their specific data.
const JSON_DATA = null;
if (JSON_DATA) {
  DATA = JSON.parse(JSON_DATA);
}

// Simple Levenshtein distance implementation
function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Find K nearest neighbors
function findKNN(target: string, k: number = 5): string[] {
  const distances = Object.entries(DATA)
    .filter(([path]) => path !== target)
    .map(([path, content]) => ({
      path,
      distance: editDistance(DATA[target], content),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);

  return distances.map(d => d.path);
}

function getDiffLines(str1: string, str2: string) {
  const lines1 = str1.split('\n');
  const lines2 = str2.split('\n');
  const result1: { text: string; type: 'same' | 'removed' }[] = [];
  const result2: { text: string; type: 'same' | 'added' }[] = [];

  let i = 0, j = 0;
  while (i < lines1.length || j < lines2.length) {
    if (i < lines1.length && j < lines2.length && lines1[i] === lines2[j]) {
      result1.push({ text: lines1[i], type: 'same' });
      result2.push({ text: lines2[j], type: 'same' });
      i++;
      j++;
    } else {
      if (i < lines1.length) {
        result1.push({ text: lines1[i], type: 'removed' });
        i++;
      }
      if (j < lines2.length) {
        result2.push({ text: lines2[j], type: 'added' });
        j++;
      }
    }
  }

  return { left: result1, right: result2 };
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedSimilarFile, setSelectedSimilarFile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const similarFiles = selectedFile ? findKNN(selectedFile) : [];
  
  // Update selectedSimilarFile whenever selectedFile changes
  useEffect(() => {
    if (selectedFile && similarFiles.length > 0) {
      setSelectedSimilarFile(similarFiles[0]);
    }
  }, [selectedFile]);

  const diffResult = selectedFile && selectedSimilarFile 
    ? getDiffLines(DATA[selectedFile], DATA[selectedSimilarFile])
    : { left: [{ text: DATA[selectedFile || ''], type: 'same' }], right: [] };

  const filteredFiles = Object.keys(DATA).filter(path =>
    path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen">
      <ResizablePanelGroup
        direction="horizontal"
        className="w-full rounded-lg border h-[800px]"
      >
        <ResizablePanel defaultSize={25}>
          <div className="flex h-full flex-col p-6">
            <h3 className="font-medium mb-4">Files</h3>
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 mb-4 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="overflow-y-auto">
              {filteredFiles.map((path) => (
                <div key={path}>
                  <button
                    onClick={() => {
                      setSelectedFile(path);
                    }}
                    className={`text-left p-2 rounded w-full hover:bg-border focus:outline-none ${
                      selectedFile === path ? "bg-accent" : ""
                    }`}
                  >
                    {path}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />
        
        <ResizablePanel defaultSize={75}>
          <div className="flex flex-col h-full">
            <div className="grid grid-cols-2 gap-4 p-6">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">Selected File:</h3>
                <Select
                  value={selectedFile || ""}
                  onValueChange={setSelectedFile}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select a file" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredFiles.map((path) => (
                      <SelectItem key={path} value={path}>
                        {path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium">Similar File:</h3>
                <Select
                  value={selectedSimilarFile || ""}
                  onValueChange={setSelectedSimilarFile}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select a similar file" />
                  </SelectTrigger>
                  <SelectContent>
                    {similarFiles.map((path) => (
                      <SelectItem key={path} value={path}>
                        {path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto border-r px-6">
                {selectedFile ? (
                  <pre className="p-4 rounded bg-muted">
                    {diffResult?.left.map((line, idx) => (
                      <code
                        key={idx}
                        className={`block ${
                          line.type === 'removed' ? 'bg-red-900/20' : ''
                        }`}
                      >
                        {line.text}
                      </code>
                    ))}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-muted-foreground">
                      Select a file to view its contents
                    </span>
                  </div>
                )}
              </div>

              <div className="h-full overflow-y-auto px-6">
                {selectedFile && selectedSimilarFile ? (
                  <pre className="p-4 rounded bg-muted">
                    {diffResult?.right.map((line, idx) => (
                      <code
                        key={idx}
                        className={`block ${
                          line.type === 'added' ? 'bg-green-900/20' : ''
                        }`}
                      >
                        {line.text}
                      </code>
                    ))}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-muted-foreground">
                      Select a file to view similar files
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
