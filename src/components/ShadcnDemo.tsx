import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, Check, Star, Users, Calendar } from "lucide-react"

export function ShadcnDemo() {
  const [inputValue, setInputValue] = useState("")
  const [showAlert, setShowAlert] = useState(false)

  return (
    <div className="space-y-8 p-8 max-w-4xl mx-auto">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-primary">shadcn/ui Demo</h1>
        <p className="text-muted-foreground text-lg">
          Testing various shadcn/ui components in your Tauri app
        </p>
      </div>

      {/* Button variants */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5" />
            Buttons
          </CardTitle>
          <CardDescription>Various button styles and variants</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon">
              <Check className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Input and interaction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Input & Interaction
          </CardTitle>
          <CardDescription>Text input with button interaction</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="Type something here..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={() => setShowAlert(true)}
              disabled={!inputValue.trim()}
            >
              Submit
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Current value: <span className="font-mono">{inputValue || "(empty)"}</span>
          </p>
        </CardContent>
      </Card>

      {/* Badges */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Badges
          </CardTitle>
          <CardDescription>Different badge variants and styles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Alert */}
      {showAlert && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Success!</AlertTitle>
          <AlertDescription>
            You entered: "{inputValue}". 
            <Button 
              variant="ghost" 
              size="sm" 
              className="ml-2 p-1 h-auto"
              onClick={() => setShowAlert(false)}
            >
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Multiple cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Card 1</CardTitle>
            <CardDescription>Sample card with content</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">This is a sample card demonstrating the card component.</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Card 2</CardTitle>
            <CardDescription>Another example card</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Badge variant="outline">Feature</Badge>
              <p className="text-sm">Cards can contain badges and other components.</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Card 3</CardTitle>
            <CardDescription>Card with action</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">This card has an action button.</p>
            <Button size="sm" className="w-full">Take Action</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}